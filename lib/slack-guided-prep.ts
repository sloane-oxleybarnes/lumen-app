import { supabaseAdmin } from "@/lib/server-admin";
import {
  buildSlackCoachingContext,
  fetchSlackConversationContext,
  runSlackCoaching,
  SlackConnectedUser,
  SlackConversationContext,
  slackContextUserNote,
} from "@/lib/slack-app";

type PrepStep = "ask_person" | "ask_outcome" | "ask_concern" | "confirm_evidence";

type SlackAgentSession = {
  id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  slack_channel_id: string;
  thread_ts: string | null;
  flow_type: "prep";
  step: PrepStep;
  status: "active" | "completed";
  answers: PrepAnswers;
  evidence_suggestions: EvidenceSuggestion[];
  confirmed_evidence: EvidenceSuggestion[];
};

type PrepAnswers = {
  initial_request?: string;
  person?: string;
  conversation_type?: string;
  outcome?: string;
  concern?: string;
  extra_context?: string[];
};

type EvidenceSuggestion = {
  id: number;
  text: string;
  source?: string;
};

type GuidedPrepInput = {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  actionToken?: string | null;
};

type GuidedPrepResult =
  | { handled: true; response: string }
  | { handled: false };

const PREP_TRIGGER_RE =
  /\b(help me prepare|prep\b|prepare\b|practice\b|1:1|one-on-one|manager|raise|promotion|salary|workload|feedback|boundary|pushback|difficult conversation|clarity)\b/i;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isGuidedPrepRequest(text: string) {
  return PREP_TRIGGER_RE.test(text);
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
  if (/\braise\b|\bpromotion\b|\bsalary\b/.test(lower)) return "raise or promotion conversation";
  if (/\bworkload\b|\btoo much\b|\bcapacity\b|\bboundary\b|\bafter-hours\b/.test(lower)) return "workload or boundary conversation";
  if (/\bfeedback\b|\bconstructive\b/.test(lower)) return "feedback conversation";
  if (/\bclarity\b|\bunclear\b|\bclean this up\b/.test(lower)) return "clarity conversation";
  if (/\b1:1\b|\bone-on-one\b/.test(lower)) return "1:1 conversation";
  return "difficult workplace conversation";
}

function initialAnswers(text: string): PrepAnswers {
  return {
    initial_request: normalizeText(text),
    person: inferPerson(text),
    conversation_type: inferConversationType(text),
    extra_context: [],
  };
}

function nextStepForAnswers(answers: PrepAnswers): PrepStep {
  if (!answers.person) return "ask_person";
  if (!answers.outcome) return "ask_outcome";
  if (!answers.concern) return "ask_concern";
  return "confirm_evidence";
}

async function findActiveSession({
  teamId,
  slackUserId,
  channelId,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .select("*")
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .eq("slack_channel_id", channelId)
    .eq("flow_type", "prep")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SlackAgentSession | null) || null;
}

async function createSession(input: GuidedPrepInput) {
  const answers = initialAnswers(input.text);
  const step = nextStepForAnswers(answers);
  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .insert({
      user_id: input.user.id,
      slack_team_id: input.teamId,
      slack_user_id: input.slackUserId,
      slack_channel_id: input.channelId,
      thread_ts: input.threadTs,
      flow_type: "prep",
      step,
      answers,
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

function isStartOver(text: string) {
  return /\b(start over|restart|new prep|new conversation|reset)\b/i.test(text);
}

function isCancel(text: string) {
  return /\b(cancel|stop|never mind|nevermind)\b/i.test(text);
}

function isLikelyTopicChange(text: string, session: SlackAgentSession) {
  if (!session.answers.outcome || text.length < 24) return false;
  return isGuidedPrepRequest(text) && /\b(instead|different|new|another)\b/i.test(text);
}

function askForStep(session: SlackAgentSession) {
  const answers = session.answers;
  switch (session.step) {
    case "ask_person":
      return [
        "Let’s prep this together.",
        "",
        "First, who are you talking to?",
        "For example: my manager, a teammate, a client, or a direct report.",
      ].join("\n");
    case "ask_outcome":
      return [
        `Got it. I’ll treat this as ${answers.conversation_type || "a difficult workplace conversation"} with ${answers.person || "this person"}.`,
        "",
        "What outcome do you want from the conversation?",
        "For example: alignment, more time, a clearer decision, a boundary, or next steps.",
      ].join("\n");
    case "ask_concern":
      return [
        "That helps.",
        "",
        "What are you most worried they may push back on, misunderstand, or react to?",
        "A short answer is enough.",
      ].join("\n");
    case "confirm_evidence":
      return formatEvidencePrompt(session.evidence_suggestions, "");
  }
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

async function buildEvidenceStep(input: GuidedPrepInput, session: SlackAgentSession, refinedText?: string) {
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
    return [
      note || "I could not find enough relevant Slack history this time.",
      "",
      "We can still prep from what you told me. Reply `none` to continue without evidence, or add one detail you want included.",
    ].join("\n");
  }

  return formatEvidencePrompt(nextSession.evidence_suggestions, note);
}

function formatFinalPrompt(session: SlackAgentSession) {
  const answers = session.answers;
  const confirmed = session.confirmed_evidence.length
    ? session.confirmed_evidence.map((item) => `- ${item.text}`).join("\n")
    : "No Slack evidence was confirmed by the user.";
  const extra = answers.extra_context?.length ? answers.extra_context.map((item) => `- ${item}`).join("\n") : "None.";

  return [
    "Create final guided prep for this workplace conversation.",
    `Initial request: ${answers.initial_request || "not specified"}`,
    `Person: ${answers.person || "not specified"}`,
    `Conversation type: ${answers.conversation_type || "not specified"}`,
    `Desired outcome: ${answers.outcome || "not specified"}`,
    `Concern or likely pushback: ${answers.concern || "not specified"}`,
    "",
    "Confirmed possible evidence from Slack:",
    confirmed,
    "",
    "Additional user context:",
    extra,
    "",
    "Return only these sections: Conversation goal, Talking points, Opening sentence, Likely pushback, Practice prompt, Follow-up draft.",
    "Keep it Slack-ready, concise, direct but kind, and avoid claiming unconfirmed Slack evidence as fact.",
  ].join("\n");
}

async function completeSession(input: GuidedPrepInput, session: SlackAgentSession) {
  const prompt = formatFinalPrompt(session);
  const response = await runSlackCoaching({
    user: input.user,
    action: "agent_message",
    prompt,
    sourceLabel: "slack_guided_prep_final",
    messageText: prompt,
    contextStatus: "available",
    contextFailureReason: null,
    contextMessageCount: session.confirmed_evidence.length,
    broaderSearchUsed: session.evidence_suggestions.length > 0,
    responseDetail: "longer",
    intent: "prep",
  });

  await updateSession(session.id, { status: "completed" });
  return [
    "Here’s the prep based on what you confirmed.",
    "",
    response,
    "",
    "If you want to keep practicing, reply with the part you want to rehearse.",
  ].join("\n");
}

function mergeAnswersForStep(session: SlackAgentSession, text: string): PrepAnswers {
  const answers: PrepAnswers = {
    ...session.answers,
    extra_context: Array.isArray(session.answers.extra_context) ? session.answers.extra_context : [],
  };
  const cleaned = normalizeText(text);

  if (session.step === "ask_person") answers.person = cleaned;
  if (session.step === "ask_outcome") answers.outcome = cleaned;
  if (session.step === "ask_concern") answers.concern = cleaned;

  return answers;
}

export async function handleGuidedSlackPrep(input: GuidedPrepInput): Promise<GuidedPrepResult> {
  const text = normalizeText(input.text);
  if (!text) return { handled: false };

  let session = await findActiveSession({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    channelId: input.channelId,
  });

  if (session && isCancel(text)) {
    await updateSession(session.id, { status: "completed" });
    return { handled: true, response: "No problem. I stopped that prep flow. Start a new one whenever you want." };
  }

  if (session && isStartOver(text)) {
    await updateSession(session.id, { status: "completed" });
    session = null;
  }

  if (session && isLikelyTopicChange(text, session)) {
    return {
      handled: true,
      response: [
        "This sounds like a new prep topic.",
        "",
        "Reply `start over` to begin a new walkthrough, or answer my last question to continue the current one.",
      ].join("\n"),
    };
  }

  if (!session) {
    if (!isGuidedPrepRequest(text)) return { handled: false };
    const created = await createSession(input);
    return { handled: true, response: askForStep(created) };
  }

  if (session.step === "confirm_evidence") {
    const parsed = parseSelection(text, session.evidence_suggestions.length);
    if (parsed.type === "search_again") {
      const response = await buildEvidenceStep(input, session, text);
      return { handled: true, response };
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
    return { handled: true, response: await completeSession(input, updated) };
  }

  const answers = mergeAnswersForStep(session, text);
  const nextStep = nextStepForAnswers(answers);
  const updated = await updateSession(session.id, { answers, step: nextStep });

  if (nextStep === "confirm_evidence") {
    return { handled: true, response: await buildEvidenceStep(input, updated) };
  }

  return { handled: true, response: askForStep(updated) };
}
