import { supabaseAdmin } from "@/lib/server-admin";
import {
  appendSlackCoachingMessage,
  buildSlackThreadArchiveAction,
  buildSlackExplainMoreAction,
  createSlackCoachingThread,
  recordSlackCoachingBotMessage,
  summarizeSlackCoachingResponse,
  updateSlackCoachingThread,
} from "@/lib/slack-history";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  fetchSlackConversationContext,
  isCompactSlackIntent,
  postSlackAgentMessage,
  runSlackCoaching,
  shouldUseBroaderSlackContext,
  slackApiPost,
  SlackCoachingIntent,
  SlackConnectedUser,
  SlackConversationContext,
  slackContextUserNote,
} from "@/lib/slack-app";

type GuidedFlowType = "respond" | "rewrite" | "decode" | "prep" | "practice";
type PrepScenario =
  | "pto"
  | "raise"
  | "workload"
  | "clarity"
  | "feedback"
  | "checkin"
  | "client"
  | "general";
type GuidedStep =
  | "ask_audience"
  | "ask_person"
  | "ask_outcome"
  | "ask_concern"
  | "confirm_evidence"
  | "ask_practice_goal"
  | "ask_practice_pushback"
  | "decode_followup";

type GuidedAnswers = {
  initial_request?: string;
  person?: string;
  conversation_type?: string;
  scenario?: PrepScenario;
  source_channel_id?: string;
  source_channel_name?: string;
  source_thread_ts?: string;
  audience?: string;
  outcome?: string;
  concern?: string;
  practice_goal?: string;
  practice_pushback?: string;
  extra_context?: string[];
  draft_options?: SlackDraftOption[];
};

type EvidenceSuggestion = {
  id: number;
  text: string;
  source?: string;
};

type SlackAgentSession = {
  id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string | null;
  flow_type: GuidedFlowType;
  step: GuidedStep;
  status: "active" | "completed";
  answers: GuidedAnswers;
  evidence_suggestions: EvidenceSuggestion[];
  confirmed_evidence: EvidenceSuggestion[];
  coaching_thread_id?: string | null;
};

type GuidedFlowInput = {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  activeContext?: SlackConversationContext | null;
  relationshipContext?: string | null;
  actionToken?: string | null;
};

type StartGuidedFlowInput = {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  intent: GuidedFlowType;
  prompt: string;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
  sourceThreadTs?: string | null;
};

type GuidedFlowResult =
  | { handled: true; response: string; title?: string; actions?: Record<string, unknown>[]; coachingThreadId?: string | null }
  | { handled: false };

export const SLACK_DRAFT_USE_ACTION_ID = "beckett_draft_use";
export const SLACK_DRAFT_SEND_ACTION_ID = "beckett_draft_send";
export const SLACK_DRAFT_CANCEL_ACTION_ID = "beckett_draft_cancel";

export type SlackDraftOption = {
  id: "direct" | "warm" | "concise";
  label: string;
  text: string;
};

const GUIDED_TRIGGER_RE =
  /\b(help me prepare|prep\b|prepare\b|practice\b|respond\b|reply\b|rewrite\b|decode\b|understand\b|1:1|one-on-one|manager|raise|promotion|salary|workload|feedback|boundary|pushback|difficult conversation|clarity)\b/i;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isGuidedPrepRequest(text: string) {
  return GUIDED_TRIGGER_RE.test(text);
}

function isGuidedFlowType(value: SlackCoachingIntent): value is GuidedFlowType {
  return value === "respond" || value === "rewrite" || value === "decode" || value === "prep" || value === "practice";
}

function inferPerson(text: string) {
  const lower = text.toLowerCase();
  if (/\bmanager\b|\bboss\b|\bsupervisor\b/.test(lower)) return "my manager";
  if (/\bteammate\b|\bcoworker\b|\bcolleague\b/.test(lower)) return "a teammate";
  if (/\bclient\b|\bcustomer\b/.test(lower)) return "a client/customer";
  if (/\bdirect report\b|\breport\b/.test(lower)) return "a direct report";
  const named = text.match(/\b(?:with|to|ask|tell)\s+([A-Z][a-z]+)\b/);
  return named?.[1] || "";
}

function inferConversationType(text: string) {
  const lower = text.toLowerCase();
  if (/\bpto\b|\btime off\b|\bvacation\b|\bweek off\b|\bday off\b|\bwedding\b|\bout of office\b|\booo\b/.test(lower)) return "time off conversation";
  if (/\braise\b|\bpromotion\b|\bsalary\b/.test(lower)) return "raise or promotion conversation";
  if (/\bworkload\b|\btoo much\b|\bcapacity\b|\bboundary\b|\bafter-hours\b/.test(lower)) return "workload or boundary conversation";
  if (/\bfeedback\b|\bconstructive\b|\bconflict\b|\btension\b|\bdisagree\b|\bfrustrated\b|\bnot pulling\b/.test(lower)) return "feedback or conflict conversation";
  if (/\bclarity\b|\bunclear\b|\bclean this up\b|\bdecision\b|\bdefinition of done\b|\bpriority\b|\bprioritize\b/.test(lower)) return "clarity or decision conversation";
  if (/\b1:1\b|\bone-on-one\b|\bcheck-?in\b/.test(lower)) return "1:1 or check-in conversation";
  if (/\bclient\b|\bcustomer\b|\bstakeholder\b|\bvendor\b|\bpartner\b/.test(lower)) return "client or stakeholder conversation";
  return "Slack conversation";
}

function inferPrepScenario(text: string): PrepScenario {
  const lower = text.toLowerCase();
  if (/\bpto\b|\btime off\b|\bvacation\b|\bweek off\b|\bday off\b|\bwedding\b|\bout of office\b|\booo\b/.test(lower)) return "pto";
  if (/\braise\b|\bpromotion\b|\bsalary\b|\bcompensation\b|\bcareer level\b|\btitle\b/.test(lower)) return "raise";
  if (/\bworkload\b|\btoo much\b|\bcapacity\b|\bboundary\b|\bafter-hours\b|\bdeadline\b|\bscope\b|\bpriorit/.test(lower)) return "workload";
  if (/\bclarity\b|\bunclear\b|\bclean this up\b|\bdecision\b|\bdefinition of done\b|\bpriority\b|\bowner\b|\btimeline\b/.test(lower)) return "clarity";
  if (/\bfeedback\b|\bconstructive\b|\bconflict\b|\btension\b|\bdisagree\b|\bfrustrated\b|\bnot pulling\b|\bhandoff\b/.test(lower)) return "feedback";
  if (/\b1:1\b|\bone-on-one\b|\bcheck-?in\b|\bmanager meeting\b/.test(lower)) return "checkin";
  if (/\bclient\b|\bcustomer\b|\bstakeholder\b|\bvendor\b|\bpartner\b/.test(lower)) return "client";
  return "general";
}

function scenarioFromAnswers(answers: GuidedAnswers): PrepScenario {
  if (answers.scenario && answers.scenario !== "general") return answers.scenario;
  return inferPrepScenario([
    answers.initial_request,
    answers.person,
    answers.conversation_type,
    answers.outcome,
    answers.concern,
  ].filter(Boolean).join(" "));
}

function outcomeExampleForScenario(scenario: PrepScenario) {
  switch (scenario) {
    case "pto":
      return "Ex: approval for the dates, a coverage plan, timing clarity, or a clean handoff.";
    case "raise":
      return "Ex: compensation alignment, a promotion path, feedback on your evidence, or clear next steps.";
    case "workload":
      return "Ex: clearer priorities, a deadline adjustment, reduced scope, or clearer ownership.";
    case "clarity":
      return "Ex: the decision owner, definition of done, priority order, timeline, or next step.";
    case "feedback":
      return "Ex: shared expectations, a specific behavior change, less tension, or a repair plan.";
    case "checkin":
      return "Ex: alignment, feedback, a decision, clearer priorities, or next steps before the next 1:1.";
    case "client":
      return "Ex: alignment on scope, a decision, timeline clarity, expectations, or next steps.";
    default:
      return "Ex: alignment, more time, a clearer decision, a boundary, or next steps.";
  }
}

function concernExampleForScenario(scenario: PrepScenario) {
  switch (scenario) {
    case "pto":
      return "Ex: the timing, coverage, workload, or whether the team can plan around it.";
    case "raise":
      return "Ex: budget, timing, performance evidence, or whether this is the right cycle.";
    case "workload":
      return "Ex: urgency, team expectations, ownership, or pressure to make an exception.";
    case "clarity":
      return "Ex: they think it was already clear, they want speed over precision, or they give another vague answer.";
    case "feedback":
      return "Ex: defensiveness, hurt feelings, disagreement about what happened, or blame shifting.";
    case "checkin":
      return "Ex: they avoid a clear answer, focus on a different priority, or run out of time.";
    case "client":
      return "Ex: scope creep, urgency, budget, timeline pressure, or unclear decision-making.";
    default:
      return "";
  }
}

function initialAnswers(
  text: string,
  flowType: GuidedFlowType,
  source?: { channelId?: string | null; channelName?: string | null; threadTs?: string | null }
): GuidedAnswers {
  const sourceAudience =
    flowType === "respond" || flowType === "rewrite" || flowType === "decode"
      ? source?.channelName
        ? `#${source.channelName}`
        : source?.channelId
          ? "this Slack conversation"
          : ""
      : "";
  return {
    initial_request: normalizeText(text),
    person: flowType === "prep" || flowType === "practice" ? inferPerson(text) : "",
    conversation_type: inferConversationType(text),
    scenario: flowType === "prep" || flowType === "practice" ? inferPrepScenario(text) : "general",
    source_channel_id: source?.channelId || undefined,
    source_channel_name: source?.channelName || undefined,
    source_thread_ts: source?.threadTs || undefined,
    audience: sourceAudience || undefined,
    extra_context: [],
  };
}

function nextStepForAnswers(flowType: GuidedFlowType, answers: GuidedAnswers): GuidedStep | null {
  if (flowType === "respond" || flowType === "rewrite") {
    if (answers.source_channel_id) return null;
    if (!answers.audience) return "ask_audience";
    return null;
  }
  if (flowType === "decode") return "decode_followup";
  if (flowType === "practice") {
    if (!answers.person) return "ask_person";
    if (!answers.practice_goal) return "ask_practice_goal";
    if (!answers.practice_pushback) return "ask_practice_pushback";
    return null;
  }
  if (!answers.person) return "ask_person";
  if (!answers.outcome) return "ask_outcome";
  if (!answers.concern) return "ask_concern";
  return "confirm_evidence";
}

function flowTitle(flowType: GuidedFlowType) {
  switch (flowType) {
    case "respond":
      return "Respond";
    case "rewrite":
      return "Rewrite";
    case "decode":
      return "Decode";
    case "prep":
      return "Prep";
    case "practice":
      return "Practice";
  }
}

function cleanSourceChannelName(channelName?: string | null) {
  if (!channelName) return "";
  if (/^(directmessage|privategroup|mpdm)$/i.test(channelName)) return "";
  return channelName.startsWith("#") ? channelName : `#${channelName}`;
}

function inferSourceLabelFromContext(activeContext?: SlackConversationContext | null, userName?: string | null) {
  const text = activeContext?.text || "";
  const normalizedUserName = (userName || "").toLowerCase().trim();
  const authors = Array.from(text.matchAll(/^([^:\n]{1,48}):\s+/gm))
    .map((match) => match[1]?.trim())
    .filter(Boolean)
    .filter((name) => !/^(Slack thread context|Recent Slack context|Active Slack context|Beckett)$/i.test(name))
    .filter((name) => !normalizedUserName || name.toLowerCase() !== normalizedUserName);
  const unique = Array.from(new Set(authors));
  return unique[0] || "";
}

function sourceLabelForFlow({
  channelName,
  activeContext,
  userName,
}: {
  channelName?: string | null;
  activeContext?: SlackConversationContext | null;
  userName?: string | null;
}) {
  return cleanSourceChannelName(channelName) || inferSourceLabelFromContext(activeContext, userName) || "this Slack conversation";
}

function sidebarOpener(flowType: GuidedFlowType) {
  switch (flowType) {
    case "respond":
      return "Let’s draft a response privately. Reply in this thread so I can keep this message, drafts, and follow-ups saved together.";
    case "decode":
      return "Let’s read this message privately. Reply in this thread so I can keep the context and follow-up questions saved together.";
    case "rewrite":
      return "Let’s clean up this wording privately. Reply in this thread so I can keep the draft and revisions saved together.";
    case "prep":
      return "Let’s prep this conversation privately. Reply in this thread so I can keep the setup, practice, and next steps saved together.";
    case "practice":
      return "Let’s practice this conversation privately. Reply in this thread so I can keep the setup and role-play saved together.";
  }
}

function assistantThreadTitle(flowType: GuidedFlowType, sourceLabel: string) {
  return `${flowTitle(flowType)}: ${sourceLabel}`.slice(0, 80);
}

function hasPastedMessage(text?: string) {
  const cleaned = normalizeText(text || "");
  if (!cleaned) return false;
  if (/["“”][^"“”]{3,}["“”]/.test(cleaned)) return true;
  return cleaned.length > 28 && !/^(help me|please|can you|could you|i need|respond|reply|decode|rewrite)\b/i.test(cleaned);
}

function missingCurrentConversationMessage(flowType: GuidedFlowType, session: SlackAgentSession, activeContext: SlackConversationContext | null) {
  if (flowType !== "respond" && flowType !== "decode") return "";
  if (!session.answers.source_channel_id) return "";
  if (activeContext?.status === "available" || hasPastedMessage(session.answers.initial_request)) return "";
  return "I could not read this Slack conversation. Paste or paraphrase the message and I’ll help.";
}

function normalizeDraftText(text: string) {
  return text
    .replace(/^[-•\s]+/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSlackDraftOptions(response: string): SlackDraftOption[] {
  const labels: Array<Pick<SlackDraftOption, "id" | "label"> & { pattern: RegExp }> = [
    { id: "direct", label: "Direct but kind", pattern: /direct\s+but\s+kind/i },
    { id: "warm", label: "Warm and collaborative", pattern: /warm\s+and\s+collaborative/i },
    { id: "concise", label: "Concise", pattern: /concise/i },
  ];
  const matches = labels
    .map((label) => {
      const match = response.match(label.pattern);
      return match?.index === undefined ? null : { ...label, index: match.index, matchText: match[0] };
    })
    .filter(Boolean) as Array<Pick<SlackDraftOption, "id" | "label"> & { index: number; matchText: string }>;

  if (matches.length < 2) return [];
  matches.sort((a, b) => a.index - b.index);

  const options = matches
    .map((match, index) => {
      const start = match.index + match.matchText.length;
      const end = matches[index + 1]?.index ?? response.length;
      const raw = response
        .slice(start, end)
        .replace(/^[:\s-]+/, "")
        .replace(/\n{2,}[\s\S]*$/m, (chunk) => {
          const firstParagraph = chunk.split(/\n{2,}/)[0] || "";
          return firstParagraph;
        });
      const text = normalizeDraftText(raw);
      return text ? { id: match.id, label: match.label, text } : null;
    })
    .filter(Boolean) as SlackDraftOption[];

  const unique = new Map<SlackDraftOption["id"], SlackDraftOption>();
  for (const option of options) unique.set(option.id, option);
  return Array.from(unique.values()).slice(0, 3);
}

export function buildSlackDraftUseActions(sessionId: string, options: SlackDraftOption[]) {
  if (!sessionId || !options.length) return [];
  return options.map((option) => ({
    type: "button",
    text: {
      type: "plain_text",
      text:
        option.id === "direct"
          ? "Use direct"
          : option.id === "warm"
            ? "Use warm"
            : "Use concise",
    },
    action_id: SLACK_DRAFT_USE_ACTION_ID,
    value: JSON.stringify({ sessionId, optionId: option.id }),
  }));
}

export async function saveSlackDraftOptions(sessionId: string, response: string) {
  const options = extractSlackDraftOptions(response);
  if (!options.length) return [];

  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .select("answers")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return [];

  await supabaseAdmin
    .from("slack_agent_sessions")
    .update({
      answers: {
        ...((data.answers as GuidedAnswers | null) || {}),
        draft_options: options,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  return options;
}

export async function createSlackDraftActionSession({
  user,
  teamId,
  slackUserId,
  agentChannelId,
  agentThreadTs,
  sourceChannelId,
  sourceChannelName,
  sourceThreadTs,
  prompt,
  response,
}: {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  agentChannelId: string;
  agentThreadTs: string;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
  sourceThreadTs?: string | null;
  prompt: string;
  response: string;
}) {
  const draftOptions = extractSlackDraftOptions(response);
  if (!draftOptions.length) return { sessionId: null, actions: [] as Record<string, unknown>[] };

  const session = await createSession({
    user,
    teamId,
    slackUserId,
    channelId: agentChannelId,
    threadTs: agentThreadTs,
    flowType: "respond",
    step: "decode_followup",
    answers: {
      initial_request: normalizeText(prompt),
      conversation_type: inferConversationType(prompt),
      source_channel_id: sourceChannelId || undefined,
      source_channel_name: sourceChannelName || undefined,
      source_thread_ts: sourceThreadTs || undefined,
      audience: sourceChannelName ? `#${sourceChannelName}` : sourceChannelId ? "this Slack conversation" : undefined,
      extra_context: [],
      draft_options: draftOptions,
    },
  });

  return {
    sessionId: session.id,
    actions: buildSlackDraftUseActions(session.id, draftOptions),
  };
}

async function findActiveSession({
  teamId,
  slackUserId,
  channelId,
  threadTs,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs?: string | null;
}) {
  let query = supabaseAdmin
    .from("slack_agent_sessions")
    .select("*")
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .eq("slack_channel_id", channelId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());

  query = threadTs ? query.eq("thread_ts", threadTs) : query.is("thread_ts", null);

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SlackAgentSession | null) || null;
}

async function createSession({
  user,
  teamId,
  slackUserId,
  channelId,
  threadTs,
  flowType,
  answers,
  step,
  coachingThreadId,
}: {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  flowType: GuidedFlowType;
  answers: GuidedAnswers;
  step: GuidedStep;
  coachingThreadId?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .insert({
      user_id: user.id,
      slack_team_id: teamId,
      slack_user_id: slackUserId,
      slack_channel_id: channelId,
      thread_ts: threadTs,
      flow_type: flowType,
      step,
      answers,
      coaching_thread_id: coachingThreadId || null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SlackAgentSession;
}

async function updateSession(sessionId: string, patch: Partial<SlackAgentSession>) {
  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) throw error;
  return data as SlackAgentSession;
}

async function persistGuidedTurn({
  input,
  session,
  userText,
  beckettText,
  fallbackSummary,
}: {
  input: GuidedFlowInput;
  session: SlackAgentSession;
  userText?: string | null;
  beckettText?: string | null;
  fallbackSummary?: string | null;
}) {
  const threadId = session.coaching_thread_id;
  if (!threadId) return;

  await appendSlackCoachingMessage({
    threadId,
    user: input.user,
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    role: "user",
    content: userText,
  }).catch((error) => {
    console.error("Slack coaching user message storage failed", {
      threadId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  await appendSlackCoachingMessage({
    threadId,
    user: input.user,
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    role: "beckett",
    content: beckettText,
  }).catch((error) => {
    console.error("Slack coaching Beckett message storage failed", {
      threadId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  await updateSlackCoachingThread(threadId, {
    summary: summarizeSlackCoachingResponse(beckettText || "", fallbackSummary || session.answers.initial_request || ""),
  }).catch(() => null);
}

function isStartOver(text: string) {
  return /\b(start over|restart|new prep|new conversation|reset)\b/i.test(text);
}

function isCancel(text: string) {
  return /\b(cancel|stop|never mind|nevermind)\b/i.test(text);
}

function isLikelyTopicChange(text: string) {
  if (text.length < 24) return false;
  return isGuidedPrepRequest(text) && /\b(instead|different|new|another)\b/i.test(text);
}

function askForStep(session: SlackAgentSession) {
  const answers = session.answers;
  const scenario = scenarioFromAnswers(answers);
  switch (session.step) {
    case "ask_audience":
      return [
        session.flow_type === "rewrite" ? "I can rewrite that." : "I can help you respond.",
        "",
        "Who is this going to, and where will you send it?",
        "For example: `DM to my manager`, `channel reply to the whole team`, or `channel reply to Priya`.",
      ].join("\n");
    case "ask_person":
      return [
        session.flow_type === "practice" ? "Let’s set up the practice." : "Let’s prep for this conversation together.",
        "",
        "First, who are you talking to?",
        "Ex: my manager, a teammate, a client, or a direct report. You can also tag a Slack teammate with @.",
      ].join("\n");
    case "ask_outcome":
      return [
        `Got it, this will be a conversation with ${answers.person || "this person"}.`,
        "",
        "What outcome do you want from the conversation?",
        outcomeExampleForScenario(scenario),
      ].join("\n");
    case "ask_concern":
      return [
        "Finally, what are you worried they may push back on, misunderstand, or react poorly to?",
        concernExampleForScenario(scenario),
      ].filter(Boolean).join("\n");
    case "ask_practice_goal":
      return [
        `Got it. I’ll role-play as ${answers.person || "the other person"}.`,
        "",
        "What do you want to practice getting better at?",
        "For example: staying direct, not over-apologizing, handling pushback, or asking for clarity.",
      ].join("\n");
    case "ask_practice_pushback":
      return [
        "Good. Last setup question:",
        "",
        "What kind of pushback should I role-play?",
        "For example: they say there is no budget, they ask why this is urgent, or they seem vague.",
      ].join("\n");
    case "decode_followup":
      return "Want help drafting a response? Reply `yes` and I’ll give you options, or `done` to stop here.";
    case "confirm_evidence":
      return formatEvidencePrompt(session.evidence_suggestions, "");
  }
}

function guidedActions(session: SlackAgentSession, draftOptions: SlackDraftOption[] = []) {
  return [
    ...buildSlackDraftUseActions(session.id, draftOptions),
    ...(session.flow_type === "decode" || session.flow_type === "respond"
      ? buildSlackExplainMoreAction(session.coaching_thread_id)
      : []),
    ...buildSlackThreadArchiveAction(session.coaching_thread_id),
  ];
}

function parseSelection(text: string, max: number) {
  const lower = text.toLowerCase().trim();
  if (/\bnone\b|\bskip\b|\bno evidence\b/.test(lower)) return { type: "none" as const, selected: [] };
  if (/\bsearch again\b|\btry again\b|\blook again\b/.test(lower)) return { type: "search_again" as const, selected: [] };

  const numbers = Array.from(text.matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((num) => Number.isInteger(num) && num >= 1 && num <= max);
  const selected = Array.from(new Set(numbers));
  if (selected.length) return { type: "numbers" as const, selected };
  return { type: "extra_context" as const, selected: [] };
}

function evidenceFromContext(context: SlackConversationContext, fallbackTopic: string) {
  if (!context.text) return [];
  const lines = context.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(Active Slack context|Relevant prior Slack history|Slack thread context|Recent Slack context)/i.test(line))
    .filter((line) => !/^\[.*trimmed\]$/i.test(line));

  const seen = new Set<string>();
  const suggestions: EvidenceSuggestion[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, " ").slice(0, 210);
    const key = cleaned.toLowerCase();
    if (seen.has(key) || cleaned.length < 24) continue;
    seen.add(key);
    suggestions.push({
      id: suggestions.length + 1,
      text: `Possible evidence: ${cleaned}`,
      source: "Slack context",
    });
    if (suggestions.length >= 5) break;
  }

  if (suggestions.length) return suggestions;
  return [
    {
      id: 1,
      text: `I could not find a clear Slack evidence point for ${fallbackTopic}. We can still prep from what you know directly.`,
      source: "Fallback",
    },
  ];
}

function formatEvidencePrompt(suggestions: EvidenceSuggestion[], note: string) {
  const intro = [
    "Before I ask you to remember everything manually, I looked for possible evidence in Slack.",
    "Confirm before including anything. These are possible support points, not guaranteed accomplishments.",
  ];
  if (note) intro.push(note);

  const evidenceLines = suggestions.map((item) => `${item.id}. ${item.text}`);
  return [
    ...intro,
    "",
    "Which should we use?",
    ...evidenceLines,
    "",
    "Reply with numbers like `1, 3`, `none`, or `search again`. You can also add one extra detail in your reply.",
  ].join("\n");
}

async function buildEvidenceStep(input: GuidedFlowInput, session: SlackAgentSession, refinedText?: string) {
  const answers = session.answers;
  const evidenceQuery = [
    answers.initial_request,
    answers.person,
    answers.conversation_type,
    answers.outcome,
    answers.concern,
    refinedText,
    "recent work feedback outcomes project wins blockers priorities",
  ].filter(Boolean).join(" ");

  const activeContext = input.activeChannelId
    ? await fetchSlackConversationContext({
        accessToken: input.user.accessToken,
        channelId: input.activeChannelId,
      })
    : null;
  const coachingContext = await buildSlackCoachingContext({
    user: input.user,
    prompt: evidenceQuery,
    activeContext,
    contextChannelId: input.activeChannelId,
    actionToken: input.actionToken,
  });
  const note = slackContextUserNote(coachingContext);
  const evidenceContext =
    coachingContext.broaderContext?.text
      ? coachingContext.broaderContext
      : coachingContext.activeContext?.text
        ? coachingContext.activeContext
        : coachingContext;
  const suggestions =
    coachingContext.status === "available"
      ? evidenceFromContext(evidenceContext, answers.conversation_type || "this conversation")
      : [];

  const nextSession = await updateSession(session.id, {
    step: "confirm_evidence",
    evidence_suggestions: suggestions,
  });

  if (!suggestions.length) {
    return "I tried to find a relevant Slack conversation or context for this, but I couldn’t find anything useful. Is there anything else you want me to know, or are we good to move on?";
  }

  return formatEvidencePrompt(nextSession.evidence_suggestions, note);
}

function promptForFlow(session: SlackAgentSession, followupText?: string) {
  const answers = session.answers;
  const extra = answers.extra_context?.length ? answers.extra_context.map((item) => `- ${item}`).join("\n") : "None.";
  const confirmed = session.confirmed_evidence.length
    ? session.confirmed_evidence.map((item) => `- ${item.text}`).join("\n")
    : "No Slack evidence was confirmed by the user.";

  const base = [
    `Initial request: ${answers.initial_request || "not specified"}`,
    `Audience/person: ${answers.audience || answers.person || "not specified"}`,
    `Conversation type: ${answers.conversation_type || "not specified"}`,
    `Scenario: ${scenarioFromAnswers(answers)}`,
    `Source Slack channel: ${answers.source_channel_name ? `#${answers.source_channel_name}` : answers.source_channel_id || "not specified"}`,
    `Outcome: ${answers.outcome || "not specified"}`,
    `Concern/pushback: ${answers.concern || answers.practice_pushback || "not specified"}`,
    `Practice goal: ${answers.practice_goal || "not specified"}`,
    `Follow-up user reply: ${followupText || "none"}`,
    "",
    "Confirmed possible evidence from Slack:",
    confirmed,
    "",
    "Additional user context:",
    extra,
  ].join("\n");

  switch (session.flow_type) {
    case "respond":
      return [
        "Help the user respond to the Slack conversation. The conversation may be workplace, workplace-adjacent, friendly, or personal; do not refuse just because it is not strictly work-related.",
        base,
        "",
        "Return sections: Possible read, Next move, Draft options.",
        "Fold what is uncertain or not knowable into Possible read in one concise sentence.",
        "Draft options must be bullet points labeled Direct but kind, Warm and collaborative, and Concise.",
      ].join("\n");
    case "rewrite":
      return [
        "Rewrite the user's message for the stated audience.",
        base,
        "",
        "Return sections: Rewritten message, Why this works.",
        "Keep the rewritten message Slack-ready and easy to copy.",
      ].join("\n");
    case "decode":
      return [
        "Decode the message or situation without over-inference. The conversation may be workplace, workplace-adjacent, friendly, or personal; help with the provided conversation rather than rejecting it as non-work.",
        base,
        "",
        "Return sections: Possible read and Next move.",
        "Fold what is visible and what is uncertain into Possible read without adding a standalone uncertainty section.",
        "End by asking whether the user wants help drafting a response.",
      ].join("\n");
    case "practice":
      return [
        "Start a workplace conversation role-play.",
        base,
        "",
        "Return a short setup summary, then speak as the other person in the practice.",
        "Use realistic but not hostile pushback. Keep it concise so the user can reply.",
      ].join("\n");
    case "prep":
      return [
        "Create final guided prep for this workplace conversation.",
        base,
        "",
        "Return only these sections: Goal, Say this first, If they push back, Watch for, Practice next.",
        "Keep each section to 1-3 short bullets or sentences. Do not include long talking-points lists, likely-pushback lists, or a follow-up draft unless the user explicitly asked for that detail.",
        "Make it feel like a calm coach helping the user know what to do next, not a full strategy memo.",
        "End with: Want to practice the opening or the pushback?",
        "Keep it Slack-ready, concise, direct but kind, and avoid claiming unconfirmed Slack evidence as fact.",
      ].join("\n");
  }
}

async function completeSession(input: GuidedFlowInput, session: SlackAgentSession, followupText?: string) {
  const prompt = promptForFlow(session, followupText);
  const contextChannelId = input.activeChannelId || session.answers.source_channel_id || null;
  const contextChannelName = session.answers.source_channel_name || null;
  const activeContext =
    input.activeContext ||
    (contextChannelId
      ? await fetchSlackConversationContext({
          accessToken: input.user.accessToken,
          channelId: contextChannelId,
          channelName: contextChannelName,
        })
      : null);
  const missingContextMessage = missingCurrentConversationMessage(session.flow_type, session, activeContext);
  if (missingContextMessage) {
    await updateSession(session.id, { status: "completed" });
    return missingContextMessage;
  }
  const contextPrompt = [
    prompt,
    session.answers.person ? `Relevant person: ${session.answers.person}` : "",
    session.answers.audience ? `Relevant audience: ${session.answers.audience}` : "",
    session.answers.source_channel_name ? `Relevant channel: #${session.answers.source_channel_name}` : "",
    "Include relevant prior Slack messages with this person or about this topic across authorized channels, DMs, and group DMs.",
  ].filter(Boolean).join("\n");
  const coachingContext = await buildSlackCoachingContext({
    user: input.user,
    prompt: contextPrompt,
    activeContext,
    contextChannelId,
    actionToken: input.actionToken,
    includeBroaderContext: shouldUseBroaderSlackContext(session.flow_type, contextPrompt),
  });
  const messageText = [
    prompt,
    coachingContext.text ? `\n${coachingContext.text}` : "",
  ].filter(Boolean).join("\n");
  const response = await runSlackCoaching({
    user: input.user,
    action: "agent_message",
    prompt,
    sourceLabel: `slack_guided_${session.flow_type}_final`,
    messageText,
    contextStatus: coachingContext.status,
    contextFailureReason: coachingContext.failureReason,
    contextMessageCount: coachingContext.messageCount,
    broaderSearchUsed: coachingContext.broaderSearchUsed || session.evidence_suggestions.length > 0,
    relationshipContext: input.relationshipContext || null,
    responseDetail: isCompactSlackIntent(session.flow_type) ? "quick" : "longer",
    intent: session.flow_type,
  });

  await updateSession(session.id, { status: session.flow_type === "decode" ? "active" : "completed" });
  if (session.flow_type === "prep") {
    return response;
  }
  return response;
}

function mergeAnswersForStep(session: SlackAgentSession, text: string): GuidedAnswers {
  const answers: GuidedAnswers = {
    ...session.answers,
    extra_context: Array.isArray(session.answers.extra_context) ? session.answers.extra_context : [],
  };
  const cleaned = normalizeText(text);

  if (session.step === "ask_audience") answers.audience = cleaned;
  if (session.step === "ask_person") answers.person = cleaned;
  if (session.step === "ask_outcome") answers.outcome = cleaned;
  if (session.step === "ask_concern") answers.concern = cleaned;
  if (session.step === "ask_practice_goal") answers.practice_goal = cleaned;
  if (session.step === "ask_practice_pushback") answers.practice_pushback = cleaned;
  if (session.flow_type === "prep" || session.flow_type === "practice") {
    answers.scenario = scenarioFromAnswers(answers);
  }

  return answers;
}

async function firstSidebarResponse(input: GuidedFlowInput, session: SlackAgentSession) {
  if (session.flow_type === "decode") {
    return completeSession(input, session);
  }
  if (session.flow_type === "respond" || session.flow_type === "rewrite") {
    const nextStep = nextStepForAnswers(session.flow_type, session.answers);
    if (nextStep) {
      const updated = await updateSession(session.id, { step: nextStep });
      return askForStep(updated);
    }
    return completeSession(input, session);
  }
  if (session.flow_type === "practice") {
    const nextStep = nextStepForAnswers("practice", session.answers);
    if (nextStep) {
      const updated = await updateSession(session.id, { step: nextStep });
      return askForStep(updated);
    }
    return completeSession(input, session);
  }
  return askForStep(session);
}

export async function startGuidedSlackFlow({
  user,
  teamId,
  slackUserId,
  intent,
  prompt,
  sourceChannelId,
  sourceChannelName,
  sourceThreadTs,
}: StartGuidedFlowInput) {
  if (!isGuidedFlowType(intent)) return { ok: false, error: "unsupported_flow" };
  const seededPrompt = sourceChannelName
    ? `${prompt}\n\nStarted from Slack channel: #${sourceChannelName}`
    : prompt;
  const answers = initialAnswers(seededPrompt, intent, {
    channelId: sourceChannelId,
    channelName: sourceChannelName,
    threadTs: sourceThreadTs,
  });
  const sourceActiveContext = sourceChannelId
    ? await fetchSlackConversationContext({
        accessToken: user.accessToken,
        channelId: sourceChannelId,
        channelName: sourceChannelName,
      })
    : null;
  const sourceLabel = sourceLabelForFlow({
    channelName: sourceChannelName,
    activeContext: sourceActiveContext,
    userName: user.name,
  });
  const step = nextStepForAnswers(intent, answers) || (intent === "decode" ? "decode_followup" : "ask_audience");
  const initialText = sidebarOpener(intent);
  const posted = await postSlackAgentMessage({
    botAccessToken: user.botAccessToken,
    slackUserId,
    title: assistantThreadTitle(intent, sourceLabel),
    text: initialText,
  });

  const postedChannelId = posted.channelId;
  const postedTs = "ts" in posted ? posted.ts : undefined;
  if (!posted.ok || !postedChannelId || !postedTs) {
    const postedError = "error" in posted ? posted.error : undefined;
    return { ok: false, error: postedError || "agent_post_failed" };
  }
  const coachingThread = await createSlackCoachingThread({
    user,
    teamId,
    slackUserId,
    flowType: intent,
    title: assistantThreadTitle(intent, sourceLabel),
    promptSnippet: prompt,
    summary: initialText,
    slackChannelId: postedChannelId,
    threadTs: postedTs,
    sourceChannelId,
    sourceChannelName,
    status: "active",
  }).catch((error) => {
    console.error("Slack coaching history create failed", {
      intent,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const session = await createSession({
    user,
    teamId,
    slackUserId,
    channelId: postedChannelId,
    threadTs: postedTs,
    flowType: intent,
    answers,
    step,
    coachingThreadId: coachingThread?.id,
  });
  if (coachingThread?.id) {
    await recordSlackCoachingBotMessage({
      threadId: coachingThread.id,
      userId: user.id,
      channelId: postedChannelId,
      messageTs: postedTs,
      kind: "opener",
    }).catch(() => null);
    await appendSlackCoachingMessage({
      threadId: coachingThread.id,
      user,
      teamId,
      slackUserId,
      role: "user",
      content: prompt,
    }).catch(() => null);
    await appendSlackCoachingMessage({
      threadId: coachingThread.id,
      user,
      teamId,
      slackUserId,
      role: "beckett",
      content: initialText,
    }).catch(() => null);
  }
  let response = "";
  try {
    response = await firstSidebarResponse(
      {
        user,
        teamId,
        slackUserId,
        channelId: postedChannelId,
        threadTs: postedTs,
        text: seededPrompt,
        activeChannelId: sourceChannelId,
        activeContext: sourceActiveContext,
      },
      session
    );

    if (response && user.botAccessToken) {
      const draftOptions = intent === "respond" ? await saveSlackDraftOptions(session.id, response) : [];
      await appendSlackCoachingMessage({
        threadId: coachingThread?.id,
        user,
        teamId,
        slackUserId,
        role: "beckett",
        content: response,
      }).catch(() => null);
      await updateSlackCoachingThread(coachingThread?.id, {
        summary: summarizeSlackCoachingResponse(response, initialText),
        status: intent === "prep" || intent === "practice" ? "active" : "completed",
      }).catch(() => null);
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: response,
        hideTitle: true,
        actions: guidedActions(session, draftOptions),
      });
      const postedResponse = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
        channel: postedChannelId,
        thread_ts: postedTs,
        ...payload,
      });
      if (postedResponse.ok && postedResponse.ts) {
        await recordSlackCoachingBotMessage({
          threadId: coachingThread?.id,
          userId: user.id,
          channelId: postedChannelId,
          messageTs: postedResponse.ts,
          kind: "reply",
        }).catch(() => null);
      }
    }
  } catch (error) {
    console.error("Slack guided flow response failed after opener", {
      intent,
      sourceChannelPresent: Boolean(sourceChannelId),
      message: error instanceof Error ? error.message : String(error),
    });
    response = "I started the private thread, but had trouble generating the response. Try the command again, or paste the message here and I’ll work from that.";
    await updateSlackCoachingThread(coachingThread?.id, {
      summary: response,
      status: "active",
    }).catch(() => null);
    if (user.botAccessToken) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: response,
        hideTitle: true,
      });
      const postedError = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
        channel: postedChannelId,
        thread_ts: postedTs,
        ...payload,
      }).catch(() => null);
      if (postedError?.ok && postedError.ts) {
        await recordSlackCoachingBotMessage({
          threadId: coachingThread?.id,
          userId: user.id,
          channelId: postedChannelId,
          messageTs: postedError.ts,
          kind: "error",
        }).catch(() => null);
      }
    }
  }

  return {
    ok: true,
    channelId: postedChannelId,
    ts: postedTs,
    response,
    title: flowTitle(intent),
  };
}

export async function handleGuidedSlackPrep(input: GuidedFlowInput): Promise<GuidedFlowResult> {
  const text = normalizeText(input.text);
  if (!text) return { handled: false };

  let session = await findActiveSession({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    channelId: input.channelId,
    threadTs: input.threadTs,
  });

  if (session && isCancel(text)) {
    await updateSession(session.id, { status: "completed" });
    const response = "No problem. I stopped that flow. Start a new one whenever you want.";
    await persistGuidedTurn({ input, session, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(session), coachingThreadId: session.coaching_thread_id };
  }

  if (session && isStartOver(text)) {
    await updateSession(session.id, { status: "completed" });
    session = null;
  }

  if (session && isLikelyTopicChange(text)) {
    const response = [
      "This sounds like a new topic.",
      "",
      "Reply `start over` to begin a new walkthrough, or answer my last question to continue the current one.",
    ].join("\n");
    await persistGuidedTurn({ input, session, userText: text, beckettText: response });
    return {
      handled: true,
      title: flowTitle(session.flow_type),
      response,
      actions: guidedActions(session),
      coachingThreadId: session.coaching_thread_id,
    };
  }

  if (!session) {
    if (!isGuidedPrepRequest(text)) return { handled: false };
    const flowType: GuidedFlowType = /\brewrite\b/i.test(text)
      ? "rewrite"
      : /\bdecode|understand\b/i.test(text)
        ? "decode"
        : /\brespond|reply\b/i.test(text)
          ? "respond"
          : /\bpractice\b/i.test(text)
            ? "practice"
            : "prep";
    const answers = initialAnswers(text, flowType, {
      channelId: input.activeChannelId,
    });
    const step = nextStepForAnswers(flowType, answers) || (flowType === "decode" ? "decode_followup" : "ask_audience");
    const sourceLabel = sourceLabelForFlow({
      activeContext: input.activeContext,
      userName: input.user.name,
    });
    const coachingThread = await createSlackCoachingThread({
      user: input.user,
      teamId: input.teamId,
      slackUserId: input.slackUserId,
      flowType,
      title: assistantThreadTitle(flowType, sourceLabel),
      promptSnippet: text,
      summary: text,
      slackChannelId: input.channelId,
      threadTs: input.threadTs,
      sourceChannelId: input.activeChannelId,
      status: "active",
    }).catch((error) => {
      console.error("Slack coaching history create failed", {
        flowType,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    const created = await createSession({
      user: input.user,
      teamId: input.teamId,
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      flowType,
      answers,
      step,
      coachingThreadId: coachingThread?.id,
    });
    const response = await firstSidebarResponse(input, created);
    const draftOptions = flowType === "respond" ? await saveSlackDraftOptions(created.id, response) : [];
    await persistGuidedTurn({
      input,
      session: created,
      userText: text,
      beckettText: response,
      fallbackSummary: text,
    });
    return {
      handled: true,
      title: flowTitle(flowType),
      response,
      actions: guidedActions(created, draftOptions),
      coachingThreadId: created.coaching_thread_id,
    };
  }

  if (session.step === "decode_followup") {
    if (/\b(done|no|stop)\b/i.test(text)) {
      await updateSession(session.id, { status: "completed" });
      const response = "Got it. I’ll stop there.";
      await persistGuidedTurn({ input, session, userText: text, beckettText: response });
      return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(session), coachingThreadId: session.coaching_thread_id };
    }
    const updated = await updateSession(session.id, {
      status: "completed",
      flow_type: "respond",
      answers: {
        ...session.answers,
        extra_context: [...(session.answers.extra_context || []), text],
      },
    });
    const response = await completeSession(input, updated, text);
    const draftOptions = await saveSlackDraftOptions(updated.id, response);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return {
      handled: true,
      title: flowTitle(updated.flow_type),
      response,
      actions: guidedActions(updated, draftOptions),
      coachingThreadId: updated.coaching_thread_id,
    };
  }

  if (session.step === "confirm_evidence") {
    const parsed = parseSelection(text, session.evidence_suggestions.length);
    if (parsed.type === "search_again") {
      const response = await buildEvidenceStep(input, session, text);
      await persistGuidedTurn({ input, session, userText: text, beckettText: response });
      return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(session), coachingThreadId: session.coaching_thread_id };
    }

    const extra_context = Array.isArray(session.answers.extra_context) ? session.answers.extra_context : [];
    const confirmed =
      parsed.type === "numbers"
        ? session.evidence_suggestions.filter((item) => parsed.selected.includes(item.id))
        : [];
    if (parsed.type === "extra_context") extra_context.push(text);

    const updated = await updateSession(session.id, {
      confirmed_evidence: confirmed,
      answers: { ...session.answers, extra_context },
    });
    const response = await completeSession(input, updated);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  const answers = mergeAnswersForStep(session, text);
  const nextStep = nextStepForAnswers(session.flow_type, answers);
  const updated = await updateSession(session.id, {
    answers,
    step: nextStep || session.step,
  });

  if (nextStep === "confirm_evidence") {
    const response = await buildEvidenceStep(input, updated);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  if (nextStep) {
    const response = askForStep(updated);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  const response = await completeSession(input, updated);
  const draftOptions = session.flow_type === "respond" ? await saveSlackDraftOptions(updated.id, response) : [];
  await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
  return {
    handled: true,
    title: flowTitle(session.flow_type),
    response,
    actions: guidedActions(updated, draftOptions),
    coachingThreadId: updated.coaching_thread_id,
  };
}
