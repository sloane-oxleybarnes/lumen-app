import { supabaseAdmin } from "@/lib/server-admin";
import {
  appendSlackCoachingMessage,
  buildSlackThreadArchiveAction,
  buildSlackExplainMoreAction,
  createSlackCoachingThread,
  formatSlackCoachingMessages,
  loadSlackCoachingMessages,
  recordSlackCoachingBotMessage,
  scheduleSlackInactivityStartCard,
  summarizeSlackCoachingResponse,
  updateSlackCoachingThread,
} from "@/lib/slack-history";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  fetchSlackConversationContext,
  isCompactSlackIntent,
  lookupSlackUserProfile,
  postSlackAgentMessage,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  shouldUseBroaderSlackContext,
  slackApiPost,
  SlackCoachingIntent,
  SlackConnectedUser,
  SlackConversationContext,
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
  | "ask_rewrite_draft"
  | "ask_respond_message"
  | "ask_respond_context"
  | "ask_opening_draft"
  | "ask_practice_goal"
  | "ask_practice_pushback"
  | "decode_followup";

type GuidedAnswers = {
  initial_request?: string;
  person?: string;
  person_slack_user_id?: string;
  person_self_mention?: boolean;
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
  sourceActiveContext?: SlackConversationContext | null;
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
const RESPOND_AFTER_OPENER_FALLBACK =
  "I started this thread, but had trouble generating the response. Paste the message or add one detail here and I’ll pick it back up.";
const FEEDBACK_ANALYSIS_RE =
  /\b(overly harsh|too harsh|harsh|mixed review|mostly critical|overly critical|always critical|was this fair|how did that land|what did they mean|feedback was|feedback is|read on this feedback)\b/i;
const CLEAR_DRAFT_REQUEST_RE =
  /\b(what should i say|help me (?:draft|respond|reply)|draft (?:a )?(?:response|reply)|respond to (?:this|that)|reply to (?:this|that)|how should i respond|how should i reply|yes[, ]+(?:draft|respond|reply))\b/i;
const PRACTICE_STARTED_MARKER = "Practice role-play has started";

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

function normalizePersonForUserDisplay(person?: string | null) {
  const cleaned = normalizeText(person || "")
    .replace(/\bmy\b/gi, "your")
    .replace(/\bour\b/gi, "your")
    .replace(/\bme\b/gi, "you")
    .replace(/\bi\b/gi, "you");
  return cleaned;
}

function slackUserIdFromPersonAnswer(text: string) {
  return (
    text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/)?.[1] ||
    text.match(/slack\.com\/team\/(U[A-Z0-9]+)/i)?.[1] ||
    null
  );
}

function slackDisplayNameFromPersonAnswer(text: string) {
  return (
    text.match(/\*\*@([^*]+)\*\*/)?.[1]?.trim() ||
    text.match(/\[@([^\]]+)\]\(https?:\/\/[^)]+\/team\/U[A-Z0-9]+\)/i)?.[1]?.trim() ||
    text.match(/<@U[A-Z0-9]+\|([^>]+)>/)?.[1]?.trim() ||
    null
  );
}

function explicitRelationshipFromPersonAnswer(text: string) {
  const lower = text.toLowerCase();
  if (/\b(?:my\s+)?manager\b|\bboss\b|\bsupervisor\b/.test(lower)) return "your manager";
  if (/\bteammate\b|\bcoworker\b|\bcolleague\b/.test(lower)) return "your teammate";
  if (/\bclient\b|\bcustomer\b/.test(lower)) return "your client";
  if (/\bdirect report\b/.test(lower)) return "your direct report";
  return "";
}

function cleanPersonAnswer(text: string) {
  const withoutRenderedMention = text
    .replace(/\[\*\*@[^*]+\*\*\]\(https?:\/\/[^)]+\/team\/U[A-Z0-9]+\)/gi, "")
    .replace(/\[@[^\]]+\]\(https?:\/\/[^)]+\/team\/U[A-Z0-9]+\)/gi, "")
    .replace(/<@U[A-Z0-9]+(?:\|[^>]+)?>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutRenderedMention
    .replace(/^(?:i(?:'?m| am)?\s+)?(?:talking|speaking|meeting|chatting)\s+(?:with|to)\s+/i, "")
    .replace(/^(?:it(?:'s| is)|this is)\s+/i, "")
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "")
    .trim();
}

export async function parseGuidedPersonAnswer({
  text,
  requesterSlackUserId,
  accessToken,
}: {
  text: string;
  requesterSlackUserId: string;
  accessToken?: string | null;
}) {
  const mentionedSlackUserId = slackUserIdFromPersonAnswer(text);
  const isSelfMention = Boolean(mentionedSlackUserId && mentionedSlackUserId === requesterSlackUserId);
  if (isSelfMention) {
    return { label: "", slackUserId: null, isSelfMention: true };
  }

  let displayName = slackDisplayNameFromPersonAnswer(text);
  if (mentionedSlackUserId && accessToken) {
    const profile = await lookupSlackUserProfile(accessToken, mentionedSlackUserId).catch(() => null);
    if (profile?.name && profile.name !== mentionedSlackUserId) displayName = profile.name;
  }

  const relationship = explicitRelationshipFromPersonAnswer(text);
  const cleaned = cleanPersonAnswer(text);
  const normalizedCleaned = normalizePersonForUserDisplay(cleaned);
  const label = displayName
    ? relationship
      ? `${relationship}, ${displayName}`
      : displayName
    : relationship || normalizedCleaned || (mentionedSlackUserId ? "the person you tagged" : "");

  return {
    label,
    slackUserId: mentionedSlackUserId,
    isSelfMention: false,
  };
}

function roleplayPersonaLabel(person?: string | null) {
  const cleaned = normalizePersonForUserDisplay(person || "");
  const lower = cleaned.toLowerCase();
  if (!cleaned) return "Other person";
  if (/\bmanager\b|\bboss\b|\bsupervisor\b/.test(lower)) return "Manager";
  if (/\bteammate\b/.test(lower)) return "Teammate";
  if (/\bcoworker\b|\bcolleague\b/.test(lower)) return "Coworker";
  if (/\bclient\b|\bcustomer\b/.test(lower)) return "Client";
  if (/\bdirect report\b|\breport\b/.test(lower)) return "Direct report";
  const slackMention = cleaned.match(/<@([A-Z0-9]+)(?:\|([^>]+))?>/);
  if (slackMention?.[2]) return slackMention[2];
  if (cleaned.startsWith("@")) return cleaned;
  const named = cleaned.match(/\b([A-Z][a-z]+)\b/);
  return named?.[1] || cleaned;
}

function practiceHasStarted(answers: GuidedAnswers) {
  return (answers.extra_context || []).some((item) => item === PRACTICE_STARTED_MARKER);
}

function isPracticeCoachingRequest(text?: string) {
  return /\b(how did that sound|was that okay|did that work|coach me|feedback|make that clearer|make it clearer|try again|what should i change|was i too|was that too)\b/i.test(text || "");
}

function isPracticeStyleDetail(text?: string) {
  return /\b(they (?:are|can be|usually|tend to|will|would)|quick to|push back|defensive|don'?t leave|doesn'?t leave|asks? a lot|problem[- ]?solv|dismiss|vague|direct|warm|busy|no room)\b/i.test(text || "");
}

function prepTopicFromInitialRequest(text: string) {
  const lower = text.toLowerCase();
  if (/\bworkload\b|\btoo much\b|\bcapacity\b|\boverloaded\b|\bpriorit(?:y|ies|ize)\b|\bdeadline\b|\bscope\b|\bownership\b/.test(lower)) {
    return "workload, priorities, or capacity";
  }
  if (/\bboundary\b|\bafter-hours\b|\bweekend\b|\bavailable\b|\bfocus time\b/.test(lower)) {
    return "boundaries or availability";
  }
  if (/\bpto\b|\btime off\b|\bvacation\b|\bweek off\b|\bday off\b|\bwedding\b|\bout of office\b|\booo\b/.test(lower)) {
    return "time off, coverage, or handoff";
  }
  if (/\braise\b|\bpromotion\b|\bsalary\b|\bcompensation\b|\bcareer level\b|\btitle\b/.test(lower)) {
    return "raise, promotion, or career next steps";
  }
  if (/\bfeedback\b|\bconstructive\b|\bconflict\b|\btension\b|\bdisagree\b|\bfrustrated\b|\bhandoff\b/.test(lower)) {
    return "feedback, conflict, or expectations";
  }
  if (/\bclarity\b|\bunclear\b|\bdecision\b|\bdefinition of done\b|\btimeline\b|\bnext steps?\b/.test(lower)) {
    return "clarity, decisions, or next steps";
  }
  return "";
}

function inferPrepOutcomeFromInitialRequest(text: string) {
  const lower = text.toLowerCase();
  if (/\bclearer priorities\b|\bpriority order\b|\bprioritize\b|\bwhat to prioritize\b/.test(lower)) {
    return "a clear priority order and next steps.";
  }
  if (/\bmore time\b|\bextension\b|\bmove the deadline\b|\badjust(?:ed)? deadline\b/.test(lower)) {
    return "alignment on timing and what needs to change.";
  }
  if (/\breduced scope\b|\breduce scope\b|\bsmaller scope\b|\bwhat can move\b|\btake off my plate\b/.test(lower)) {
    return "agreement on what can move, shrink, or be taken off your plate.";
  }
  if (/\bset a boundary\b|\bclear boundary\b|\bafter-hours boundary\b|\bfocus time\b/.test(lower)) {
    return "a clear boundary and shared expectations.";
  }
  return "";
}

function initialPrepTopicFromAnswers(answers: GuidedAnswers) {
  return (answers.extra_context || [])
    .find((item) => item.startsWith("Initial prep topic:"))
    ?.replace(/^Initial prep topic:\s*/i, "")
    .replace(/\.$/, "");
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

function shouldIncludeEscalationGuidance(answers: GuidedAnswers, followupText?: string) {
  const text = [
    answers.initial_request,
    answers.audience,
    answers.person,
    answers.conversation_type,
    answers.outcome,
    answers.concern,
    ...(answers.extra_context || []),
    followupText,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(manager|boss|supervisor|hr|human resources|people team|legal|compliance|policy)\b/.test(text)) return true;
  if (/\b(outside (?:of )?my scope|not my scope|scope creep|workload|capacity|overloaded|too much work|boundary|ownership|deadline|priority|repeated|keeps asking|again)\b/.test(text)) return true;
  if (/\b(harass|harassment|discriminat|retaliat|unsafe|safety|threat|bully|hostile|inappropriate|unethical|illegal)\b/.test(text)) return true;
  if (/\b(power dynamic|senior|director|vp|executive|client|customer)\b/.test(text)) return true;
  return false;
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
  const initialRequest = normalizeText(text);
  const prepTopic = flowType === "prep" || flowType === "practice" ? prepTopicFromInitialRequest(initialRequest) : "";
  const sourceAudience =
    flowType === "respond" || flowType === "rewrite" || flowType === "decode"
      ? source?.channelName
        ? `#${source.channelName}`
        : source?.channelId
          ? "this Slack conversation"
          : ""
      : "";
  return {
    initial_request: initialRequest,
    person: flowType === "prep" || flowType === "practice" ? normalizePersonForUserDisplay(inferPerson(text)) : "",
    conversation_type: inferConversationType(text),
    scenario: flowType === "prep" || flowType === "practice" ? inferPrepScenario(text) : "general",
    source_channel_id: source?.channelId || undefined,
    source_channel_name: source?.channelName || undefined,
    source_thread_ts: source?.threadTs || undefined,
    audience: sourceAudience || undefined,
    outcome: flowType === "prep" ? inferPrepOutcomeFromInitialRequest(initialRequest) || undefined : undefined,
    extra_context: prepTopic ? [`Initial prep topic: ${prepTopic}.`] : [],
  };
}

function nextStepForAnswers(flowType: GuidedFlowType, answers: GuidedAnswers): GuidedStep | null {
  if (flowType === "rewrite") {
    if (!answers.audience) return "ask_audience";
    if (!hasPastedMessage(answers.initial_request)) return "ask_rewrite_draft";
    return null;
  }
  if (flowType === "respond") {
    if (answers.source_channel_id) return null;
    if (respondContextIsEnough(answers)) return null;
    if (!answers.audience) return "ask_audience";
    if (!hasPastedMessage(answers.initial_request)) return "ask_respond_message";
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

function isLikelyCoworkerMessageText(text: string) {
  const cleaned = normalizeText(text);
  if (!cleaned) return false;
  if (/["“”][^"“”]{3,}["“”]/.test(cleaned)) return true;
  if (/^(they|she|he|my coworker|my teammate)\s+(said|asked|wrote|sent)\b/i.test(cleaned)) return true;
  if (/^(i can't|i cannot|i can’t|can't|cannot|can’t|no\b|not able|unable|it has|this has|that would|it would|yes\b)/i.test(cleaned)) return false;
  return cleaned.length > 45 && /[?.!]/.test(cleaned);
}

function responseContextValues(answers: GuidedAnswers) {
  const items = answers.extra_context || [];
  return {
    hasPromptedForMessage: items.includes("Respond context asked: message"),
    hasAskedPattern: items.includes("Respond context asked: pattern"),
    hasAskedPriority: items.includes("Respond context asked: priority"),
    hasAskedManager: items.includes("Respond context asked: manager"),
    hasPastedMessage:
      hasPastedMessage(answers.initial_request) ||
      items.some((item) => item.startsWith("Coworker message:") || item.startsWith("Message/paraphrase:")),
    detailText: items.filter((item) => !item.startsWith("Respond context asked:")).join(" "),
  };
}

function respondContextIsEnough(answers: GuidedAnswers) {
  const values = responseContextValues(answers);
  if (values.hasPastedMessage) return true;
  const combined = [
    answers.initial_request,
    answers.audience,
    values.detailText,
  ].filter(Boolean).join(" ").toLowerCase();
  const hasPatternDetail = /\b(one[- ]?time|once|twice|again|repeated|keeps|pattern|happened before|first time)\b/.test(combined);
  const hasPriorityDetail = /\b(deadline|delay|priority|priorities|manager owns|current work|scope|ownership|workload|capacity)\b/.test(combined);
  const hasClearReplyGoal = /\b(reply|respond|answer|say|ask|tell)\b/.test(combined);
  const hasNamedTarget = /\b(to|for|from)\s+@?[a-z][a-z'-]+|\bmanager\b|\bboss\b|\bcoworker\b|\bteammate\b|\bclient\b|\bcustomer\b/i.test(combined);
  const hasQuotedOrTargetPhrase = /["“”][^"“”]{3,}["“”]/.test(answers.initial_request || "") || /\bmeans by\b|\bwhat (?:he|she|they) means\b|\bwithout sounding\b|\bnot sound\b/i.test(combined);
  const hasUsableScenario = combined.length > 80 && hasClearReplyGoal && /\b(message|coworker|teammate|manager|boss|client|customer|jordan|claire|priya|scope|workload|feedback|deadline|review|clarify|defensive|respond|reply)\b/.test(combined);

  if (/\b(can't|cannot|don'?t want to|not able to|unable to|can’t)\s+(paste|share)\b/.test(combined)) {
    return hasPatternDetail || hasPriorityDetail;
  }
  if (hasClearReplyGoal && hasNamedTarget && hasQuotedOrTargetPhrase) return true;
  if (hasClearReplyGoal && hasPriorityDetail && /\boutside (?:of )?my scope|scope|workload|capacity\b/.test(combined)) return true;
  if (hasUsableScenario) return true;
  if (hasPatternDetail && hasPriorityDetail) return true;
  return false;
}

async function userMessageShouldOverrideGuidedStep(input: GuidedFlowInput, session: SlackAgentSession, text: string) {
  const cleaned = normalizeText(text);
  if (!cleaned) return false;
  if (isUserCorrectingWrongFlow(cleaned) || shouldSwitchToFeedbackAnalysis(cleaned)) return true;
  if (session.step === "decode_followup") return false;
  if (session.step === "ask_rewrite_draft" || session.step === "ask_opening_draft") return false;
  if (session.step === "ask_respond_message" || session.step === "ask_respond_context") {
    return respondContextIsEnough(await mergeAnswersForStep(input, session, cleaned));
  }
  if (session.flow_type === "prep" || session.flow_type === "practice") {
    const asksDifferentThing =
      /\b(can you|could you|what should|how should|does this|is this|was this|tell me|look at|instead|actually)\b/i.test(cleaned);
    const isLikelySetupAnswer = cleaned.length < 90 && !/[?]/.test(cleaned);
    return asksDifferentThing && !isLikelySetupAnswer;
  }
  return /\?/.test(cleaned) && cleaned.length > 40;
}

function isPracticeRoleplayRequest(text: string) {
  return /\b(can we practice|let'?s practice|practice (?:this|the|my|our|whole)|practice the whole conversation|role[- ]?play|rehearse|you can be|you be|i'?ll ask|i will ask|pretend you(?:'re| are)|be my manager|be my boss|be my teammate|be my coworker|be my client|opening|pushback)\b/i.test(text);
}

function nextRespondContextQuestion(answers: GuidedAnswers) {
  const values = responseContextValues(answers);
  const combined = [
    answers.initial_request,
    answers.audience,
    values.detailText,
  ].filter(Boolean).join(" ").toLowerCase();

  if (!values.hasPromptedForMessage && !values.hasPastedMessage) {
    return "Are you able to paste the message from your coworker here? This will help me understand their tone, urgency, how they framed it, and whether this is a one-off request.";
  }
  if (!values.hasAskedPattern && /\b(scope|workload|capacity|outside|boundary|take on work|coworker|teammate)\b/.test(combined)) {
    return "Has this happened before, or is this a one-time ask?";
  }
  if (!values.hasAskedPriority && /\b(scope|workload|capacity|deadline|priority|manager|delay|ownership)\b/.test(combined)) {
    return "Would taking this on delay your current work or change priorities your manager owns?";
  }
  if (!values.hasAskedManager && /\b(manager|boss|supervisor|loop|tell|bring this up)\b/.test(combined)) {
    return "Are you thinking of looping in your manager because this affects workload, ownership, or a repeated pattern?";
  }
  if (!values.hasPastedMessage) {
    return "Can you paraphrase the message if you do not want to paste it exactly?";
  }
  return "";
}

function markerForRespondQuestion(question: string) {
  if (question.startsWith("Are you able to paste")) return "Respond context asked: message";
  if (question.startsWith("Has this happened")) return "Respond context asked: pattern";
  if (question.startsWith("Would taking this on")) return "Respond context asked: priority";
  if (question.startsWith("Are you thinking of looping")) return "Respond context asked: manager";
  return "Respond context asked: paraphrase";
}

function extractQuotedPhrase(text?: string) {
  const match = (text || "").match(/["“”]([^"“”]{3,120})["“”]/);
  return match?.[1]?.trim() || "";
}

function fallbackResponseForSession(session: SlackAgentSession) {
  if (session.flow_type !== "respond") return RESPOND_AFTER_OPENER_FALLBACK;

  const request = session.answers.initial_request || "";
  const phrase = extractQuotedPhrase(request);
  const person =
    request.match(/\b(?:reply to|respond to|answer|ask|tell)\s+([A-Z][a-z]+)\b/)?.[1] ||
    session.answers.audience ||
    "them";
  const topic = phrase || "what they mean";
  const direct = phrase
    ? `Can you clarify what you mean by “${phrase}”? I want to make sure I revise the right part.`
    : "Can you clarify what you want me to focus on? I want to make sure I respond to the right thing.";
  const warm = phrase
    ? `That makes sense. When you say “${phrase},” do you mean the value needs to show up earlier, or that the flow itself is hard to follow?`
    : "That makes sense. Can you point me to the part that feels least clear so I can tighten the right thing?";
  const concise = phrase
    ? `When you say “${phrase},” what part should I focus on first?`
    : "What part should I focus on first?";

  return [
    "~ Possible read ~",
    `I had trouble generating the full coaching response, so I’m giving you a safe draft from what you already shared. The safest move is to sound curious and specific with ${person}, not defensive.`,
    "",
    "I’m drafting from what you shared here. If you paste the original message, I can make this more precise.",
    "",
    "~ Next move ~",
    `Ask one clarifying question about ${topic} so you know what to change before you revise.`,
    "",
    "~ Draft options ~",
    `- Direct but kind: “${direct}”`,
    `- Warm and collaborative: “${warm}”`,
    `- Concise: “${concise}”`,
  ].join("\n");
}

function missingCurrentConversationMessage(flowType: GuidedFlowType, session: SlackAgentSession, activeContext: SlackConversationContext | null) {
  if (flowType !== "respond" && flowType !== "decode") return "";
  if (!session.answers.source_channel_id) return "";
  if (
    activeContext?.status === "available" ||
    hasPastedMessage(session.answers.initial_request) ||
    (flowType === "respond" && respondContextIsEnough(session.answers))
  ) return "";
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

export async function hasActiveGuidedSlackSession({
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
  return Boolean(await findActiveSession({ teamId, slackUserId, channelId, threadTs }));
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

function isUserCorrectingWrongFlow(text: string) {
  return /\b(no,?|not what i mean|that's not what i mean|that is not what i mean|you'?re not responding|you are not responding|i want to know if|i'?m asking if|i asked if)\b/i.test(text);
}

function isFeedbackAnalysisRequest(text: string) {
  return FEEDBACK_ANALYSIS_RE.test(text);
}

function shouldSwitchToFeedbackAnalysis(text: string) {
  return isFeedbackAnalysisRequest(text) || (isUserCorrectingWrongFlow(text) && /\b(feedback|harsh|critical|mixed|fair|claire)\b/i.test(text));
}

function shouldSwitchToMessageDecode(text: string) {
  return /\b(explain what .*means?|what does .*mean|what this means?|decode|understand|read this|what'?s going on|what is going on|what might .*mean|tone|intent|subtext)\b/i.test(text);
}

function askForStep(session: SlackAgentSession) {
  const answers = session.answers;
  const scenario = scenarioFromAnswers(answers);
  const initialPrepTopic = initialPrepTopicFromAnswers(answers);
  switch (session.step) {
    case "ask_audience":
      if (session.flow_type === "rewrite") {
        return "Let’s work on rewriting your message. First, who is this going to and where will you send it?";
      }
      return [
        "I can help you respond.",
        "",
        "Who is this going to, and where will you send it?",
        "For example: `DM to my manager`, `channel reply to the whole team`, or `channel reply to Priya`.",
      ].join("\n");
    case "ask_rewrite_draft":
      return `Paste the message you want to rewrite, and I'll tighten it up for ${answers.audience || "the person you're sending it to"}, making sure to keep it clear and kind.`;
    case "ask_respond_message":
    case "ask_respond_context":
      return nextRespondContextQuestion(answers) || "Can you paraphrase the message if you do not want to paste it exactly?";
    case "ask_opening_draft":
      return "Paste the opening you want to try, and I’ll help you make it clear, calm, and ready to say.";
    case "ask_person":
      if (answers.person_self_mention) {
        return [
          "That tag points to you, so I still need the other person in the conversation.",
          "Who are you preparing to talk to? You can describe their role or tag them with @.",
        ].join("\n");
      }
      return [
        session.flow_type === "practice" ? "Let’s set up the practice." : "Let’s prep for this conversation together.",
        "",
        "First, who are you talking to?",
        "Ex: my manager, a teammate, a client, or a direct report. You can also tag a Slack teammate with @.",
      ].join("\n");
    case "ask_outcome":
      return [
        `Got it, this will be a conversation with ${normalizePersonForUserDisplay(answers.person) || "this person"}.`,
        initialPrepTopic ? `I have the topic as ${initialPrepTopic}.` : "",
        "",
        "What outcome do you want from the conversation?",
        outcomeExampleForScenario(scenario),
      ].filter(Boolean).join("\n");
    case "ask_concern":
      return [
        "Finally, what are you worried they may push back on, misunderstand, or react poorly to?",
        concernExampleForScenario(scenario),
      ].filter(Boolean).join("\n");
    case "ask_practice_goal":
      return [
        `Got it. I’ll role-play as ${normalizePersonForUserDisplay(answers.person) || "the other person"}.`,
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
      return formatPrepExamplesPrompt();
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

function isNoExtraExamples(text: string) {
  return /\b(none|skip|no examples?|nothing else|good to move on|move on|nope|no)\b/i.test(text.trim());
}

function formatPrepExamplesPrompt() {
  return [
    "Do you have any specific examples you want me to use?",
    "",
    "Paste anything helpful here, like a recent message, pattern, project detail, or example of what has happened before.",
    "If not, reply `none` and I’ll prep from what you already told me.",
  ].join("\n");
}

async function buildEvidenceStep(_input: GuidedFlowInput, session: SlackAgentSession) {
  const nextSession = await updateSession(session.id, {
    step: "confirm_evidence",
    evidence_suggestions: [],
    confirmed_evidence: [],
  });
  return askForStep(nextSession);
}

function promptForFlow(session: SlackAgentSession, followupText?: string, recentTranscript?: string) {
  const answers = session.answers;
  const extra = answers.extra_context?.length ? answers.extra_context.map((item) => `- ${item}`).join("\n") : "None.";
  const respondContext = responseContextValues(answers);
  const openingDraft = answers.extra_context?.find((item) => item.startsWith("Opening draft to coach:")) || "";
  const personaLabel = roleplayPersonaLabel(answers.person);
  const roleplayStarted = practiceHasStarted(answers);
  const practicePushback = answers.practice_pushback || answers.concern || "realistic questions or pushback";
  const confirmed = session.confirmed_evidence.length
    ? session.confirmed_evidence.map((item) => `- ${item.text}`).join("\n")
    : "No extra examples were provided by the user.";

  const base = [
    "Important: Use the flow type as a hint, not a rule. Answer the latest user request in the most useful way. If the user corrected the task, changed direction, or asked a different question, follow the latest user request.",
    "If one detail is genuinely missing, ask one focused question. Otherwise, provide the best answer from the scenario and context available.",
    "",
    `Initial request: ${answers.initial_request || "not specified"}`,
    `Audience/person: ${answers.audience || answers.person || "not specified"}`,
    `Conversation type: ${answers.conversation_type || "not specified"}`,
    `Scenario: ${scenarioFromAnswers(answers)}`,
    `Source Slack channel: ${answers.source_channel_name ? `#${answers.source_channel_name}` : answers.source_channel_id || "not specified"}`,
    `Outcome: ${answers.outcome || "not specified"}`,
    `Concern/pushback: ${answers.concern || answers.practice_pushback || "not specified"}`,
    `Practice goal: ${answers.practice_goal || "not specified"}`,
    session.flow_type === "respond" ? `Exact coworker wording provided: ${respondContext.hasPastedMessage ? "yes" : "no"}` : "",
    `Follow-up user reply: ${followupText || "none"}`,
    "",
    "Confirmed examples or context:",
    confirmed,
    "",
    "Additional user context:",
    extra,
    recentTranscript ? "\nRecent role-play transcript:" : "",
    recentTranscript || "",
  ].join("\n");
  const escalationInstruction = shouldIncludeEscalationGuidance(answers, followupText)
    ? "Because the user mentioned scope, workload, manager/HR, policy, safety, repeated boundary issues, or a power dynamic, include a short manager/HR escalation note only if it is appropriate. For workload/scope, usually give the coworker reply first, then one concise note on when/how to loop in a manager. For harassment, discrimination, safety, retaliation, or policy concerns, suggest HR or the appropriate internal channel without over-dramatizing."
    : "Do not add manager or HR escalation guidance unless the context clearly justifies it.";

  switch (session.flow_type) {
    case "respond":
      return [
        "Help the user respond to the Slack conversation. The conversation may be workplace, workplace-adjacent, friendly, or personal; do not refuse just because it is not strictly work-related.",
        base,
        "",
        "If the exact coworker message is missing but the scenario details are present, draft from the scenario instead of asking for the message again.",
        "If drafting without exact wording, do not claim tone or urgency from the coworker. Include this short note: Since I don’t have their exact wording, I’ll keep this neutral.",
        "Never start with 'No Slack message provided.' Never include a 'Quick frame' section.",
        "For an obvious low-stakes social message, use the visible message and channel context to give drafts immediately; do not ask multiple questions about relationship, channel vibe, or tone.",
        "If the user supplies more context in this Respond thread, use it to refine the requested drafts. Do not ask what kind of Beckett help they want or offer Decode/Respond/Rewrite choices.",
        "Prefer sections when they fit: Possible read, Next move, Draft options.",
        "Fold what is uncertain or not knowable into Possible read in one concise sentence.",
        "Draft options must be bullet points labeled Direct but kind, Warm and collaborative, and Concise.",
        escalationInstruction,
      ].join("\n");
    case "rewrite":
      return [
        "Rewrite the user's message for the stated audience.",
        base,
        "",
        "When offering variants, begin directly with 'Here are three options:' and do not recap the user's request.",
        "Preserve the original meaning and boundary, apply the requested tone change, and make each option meaningfully different.",
        "Keep the rewritten message Slack-ready, calm when requested, and easy to copy without making it needlessly apologetic.",
      ].join("\n");
    case "decode":
      if (isFeedbackAnalysisRequest([answers.initial_request, followupText, ...(answers.extra_context || [])].filter(Boolean).join(" "))) {
        return [
          "Assess the feedback or conversation the user provided. Answer whether it reads as harsh, mixed, fair, critical, supportive, or collaborative.",
          base,
          "",
          "Prefer these sections with tildes when they fit: ~ Read ~, ~ What points to that ~, ~ What to take from it ~.",
          "Do not ask for an exact message if pasted feedback or visible context is already present.",
          "Do not include Draft options or Next move unless the user explicitly asks what to say.",
          "For the Claire video feedback scenario, distinguish specific criticism from clear positives and avoid treating lots of notes as cruelty.",
        ].join("\n");
      }
      return [
        "Decode the message or situation without over-inference. The conversation may be workplace, workplace-adjacent, friendly, or personal; help with the provided conversation rather than rejecting it as non-work.",
        base,
        "",
        "Lead with a short likely read, followed by concise visible evidence, one or two possible interpretations, and a practical next step.",
        "Use visible reactions and surrounding channel context when they are provided.",
        "Fold what is visible and what is uncertain into Possible read without adding a standalone uncertainty section.",
        "End by asking whether the user wants help drafting a response.",
      ].join("\n");
    case "practice":
      if (roleplayStarted) {
        return [
          "Continue the workplace conversation role-play already in progress.",
          base,
          "",
          `Role-play persona: ${personaLabel}.`,
          `Role-play tension/pushback to weave in naturally: ${practicePushback}.`,
          "Use the Recent role-play transcript as memory for what has already happened. If the user refers to what they said earlier, look there first.",
          isPracticeCoachingRequest(followupText)
            ? "The user is asking for coaching. Pause role-play, give brief feedback on their last line, then invite them to continue."
            : `Stay in character as ${personaLabel}. Respond directly to the user's latest line as that person would in the conversation.`,
          "Return only one concise turn. Do not restart the scenario, do not repeat setup, and do not ask 'go ahead, what do you say?' again.",
          "Do not ask what the user said, whether role-play has started, or whether they are about to give their opening line. The thread already contains the practice history.",
          "Do not return prep sections like Goal, Say this first, If they push back, Watch for, or Practice next.",
        ].join("\n");
      }
      return [
        "Start a workplace conversation role-play.",
        base,
        "",
        `Role-play persona: ${personaLabel}.`,
        `Role-play tension/pushback to weave in naturally: ${practicePushback}.`,
        "The user wants to rehearse, not receive another prep card. Do not return sections like Goal, Say this first, If they push back, Watch for, or Practice next.",
        `Start with one short setup line, then speak as ${personaLabel}.`,
        `Example shape: Okay. I’ll be ${normalizePersonForUserDisplay(answers.person) || "the other person"}. ${personaLabel}: "Sure, what do you want to talk through?"`,
        "Use realistic but not hostile pushback. Keep it concise so the user can reply.",
        "If the user asks for coaching mid-practice, pause role-play, give brief coaching, then invite them to continue.",
      ].join("\n");
    case "prep":
      if (openingDraft) {
        return [
          "Coach the user's opening line for the prepared conversation.",
          base,
          "",
          openingDraft,
          "",
          "Prefer these sections with tildes when they fit: ~ What works ~, ~ Try this version ~, ~ Why it works ~, ~ Practice next ~.",
          "Do not restate the full prep. Focus on the user's pasted opening.",
          "Keep it concise, concrete, and coach-like.",
        ].join("\n");
      }
      return [
        "Create final guided prep for this workplace conversation.",
        base,
        "",
        "Prefer these sections with tildes when they fit: ~ Goal ~, ~ Say this first ~, ~ If they push back ~, ~ Watch for ~, ~ Practice next ~.",
        "Keep each section to 1-3 short bullets or sentences. Do not include long talking-points lists, likely-pushback lists, or a follow-up draft unless the user explicitly asked for that detail.",
        "Make it feel like a calm coach helping the user know what to do next, not a full strategy memo.",
        "If no extra examples were provided, still prep from the user's stated scenario. Do not say you need the actual pattern before helping.",
        "Do not claim you cannot access DMs, private channels, or Slack history unless the prompt gives a specific Slack failure reason.",
        "End with: Want to practice the opening or the pushback?",
        "Keep it Slack-ready, concise, direct but kind, and avoid claiming unconfirmed Slack evidence as fact.",
      ].join("\n");
  }
}

async function completeSession(input: GuidedFlowInput, session: SlackAgentSession, followupText?: string) {
  const recentPracticeTranscript =
    session.flow_type === "practice" && session.coaching_thread_id
      ? formatSlackCoachingMessages(
          await loadSlackCoachingMessages({
            threadId: session.coaching_thread_id,
            userId: input.user.id,
            limit: 10,
          }).catch(() => []),
          2400
        )
      : "";
  const prompt = promptForFlow(session, followupText, recentPracticeTranscript);
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
    session.flow_type === "prep"
      ? ""
      : "Include relevant prior Slack messages with this person or about this topic across authorized channels, DMs, and group DMs.",
  ].filter(Boolean).join("\n");
  const includeBroaderContext =
    session.flow_type === "prep" ? false : shouldUseBroaderSlackContext(session.flow_type, contextPrompt);
  const coachingContext = await buildSlackCoachingContext({
    user: input.user,
    prompt: contextPrompt,
    activeContext,
    contextChannelId,
    actionToken: input.actionToken,
    includeBroaderContext,
    relevantSlackUserIds: session.answers.person_slack_user_id
      ? [session.answers.person_slack_user_id]
      : [],
    currentSlackUserId: input.slackUserId,
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
  await updateSession(session.id, {
    status:
      session.flow_type === "decode" || session.flow_type === "prep" || session.flow_type === "practice"
        ? "active"
        : "completed",
  });
  return response;
}

async function safeCompleteSession(input: GuidedFlowInput, session: SlackAgentSession, followupText?: string) {
  try {
    return await completeSession(input, session, followupText);
  } catch (error) {
    console.error("Slack guided flow completion failed", {
      flowType: session.flow_type,
      step: session.step,
      message: error instanceof Error ? error.message : String(error),
    });
    return "I had trouble finishing that response, but your thread is still here. Try once more, or send one more detail and I’ll pick it back up.";
  }
}

async function mergeAnswersForStep(input: GuidedFlowInput, session: SlackAgentSession, text: string): Promise<GuidedAnswers> {
  const answers: GuidedAnswers = {
    ...session.answers,
    extra_context: Array.isArray(session.answers.extra_context) ? session.answers.extra_context : [],
  };
  const cleaned = normalizeText(text);

  if (session.step === "ask_audience") answers.audience = cleaned;
  if (session.step === "ask_rewrite_draft") answers.initial_request = cleaned;
  if (session.step === "ask_respond_message" || session.step === "ask_respond_context") {
    const label = isLikelyCoworkerMessageText(cleaned) ? "Coworker message" : "Message/paraphrase";
    answers.extra_context = [
      ...(answers.extra_context || []),
      `${label}: ${cleaned}`,
    ];
  }
  if (session.step === "ask_opening_draft") {
    answers.extra_context = [
      ...(answers.extra_context || []),
      `Opening draft to coach: ${cleaned}`,
    ];
  }
  if (session.step === "ask_person") {
    const parsedPerson = await parseGuidedPersonAnswer({
      text: cleaned,
      requesterSlackUserId: input.slackUserId,
      accessToken: input.user.accessToken,
    });
    answers.person = parsedPerson.label;
    answers.person_slack_user_id = parsedPerson.slackUserId || undefined;
    answers.person_self_mention = parsedPerson.isSelfMention;
  }
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
    return safeCompleteSession(input, session);
  }
  if (session.flow_type === "respond" || session.flow_type === "rewrite") {
    const nextStep = nextStepForAnswers(session.flow_type, session.answers);
    if (nextStep) {
      const updated = await updateSession(session.id, { step: nextStep });
      const response = askForStep(updated);
      if (session.flow_type === "respond" && (nextStep === "ask_respond_message" || nextStep === "ask_respond_context")) {
        await updateSession(updated.id, {
          answers: {
            ...updated.answers,
            extra_context: [
              ...(updated.answers.extra_context || []),
              markerForRespondQuestion(response),
            ],
          },
        });
      }
      return response;
    }
    return safeCompleteSession(input, session);
  }
  if (session.flow_type === "practice") {
    const nextStep = nextStepForAnswers("practice", session.answers);
    if (nextStep) {
      const updated = await updateSession(session.id, { step: nextStep });
      return askForStep(updated);
    }
    const response = await safeCompleteSession(input, session);
    if (!practiceHasStarted(session.answers)) {
      await updateSession(session.id, {
        answers: {
          ...session.answers,
          extra_context: [
            ...(session.answers.extra_context || []),
            PRACTICE_STARTED_MARKER,
          ],
        },
      });
    }
    return response;
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
  sourceActiveContext: providedSourceActiveContext,
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
  const sourceActiveContext = providedSourceActiveContext || (sourceChannelId
    ? await fetchSlackConversationContext({
        accessToken: user.accessToken,
        channelId: sourceChannelId,
        channelName: sourceChannelName,
        threadTs: sourceThreadTs,
      })
    : null);
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

    if (!response) response = fallbackResponseForSession(session);

    if (user.botAccessToken) {
      const fallbackResponse = fallbackResponseForSession(session);
      const isFallbackResponse = response === fallbackResponse;
      const draftOptions = !isFallbackResponse && intent === "respond" ? await saveSlackDraftOptions(session.id, response) : [];
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
      console.info("Slack guided flow first response attempted", {
        intent,
        sessionPresent: Boolean(session.id),
        sourceChannelPresent: Boolean(sourceChannelId),
        responseGenerated: Boolean(response),
        responsePosted: Boolean(postedResponse.ok && postedResponse.ts),
        failureReason: postedResponse.ok ? null : postedResponse.error || "slack_post_failed",
      });
      if (postedResponse.ok && postedResponse.ts) {
        await recordSlackCoachingBotMessage({
          threadId: coachingThread?.id,
          userId: user.id,
          channelId: postedChannelId,
          messageTs: postedResponse.ts,
          kind: "reply",
        }).catch(() => null);
      } else if (!isFallbackResponse) {
        const fallbackPayload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          body: fallbackResponse,
          hideTitle: true,
        });
        const postedFallback = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
          channel: postedChannelId,
          thread_ts: postedTs,
          ...fallbackPayload,
        }).catch((error) => {
          console.error("Slack guided flow fallback post threw", {
            intent,
            sessionPresent: Boolean(session.id),
            sourceChannelPresent: Boolean(sourceChannelId),
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
        console.info("Slack guided flow fallback attempted", {
          intent,
          sessionPresent: Boolean(session.id),
          sourceChannelPresent: Boolean(sourceChannelId),
          responsePosted: Boolean(postedFallback?.ok && postedFallback.ts),
          failureReason: postedFallback?.ok ? null : postedFallback?.error || "fallback_post_failed",
        });
        if (postedFallback?.ok && postedFallback.ts) {
          response = fallbackResponse;
          await recordSlackCoachingBotMessage({
            threadId: coachingThread?.id,
            userId: user.id,
            channelId: postedChannelId,
            messageTs: postedFallback.ts,
            kind: "error",
          }).catch(() => null);
        }
      }
      if (coachingThread?.id) {
        scheduleSlackBackgroundTask(
          "Slack inactivity start card failed",
          scheduleSlackInactivityStartCard({
            botAccessToken: user.botAccessToken,
            threadId: coachingThread.id,
            userId: user.id,
            channelId: postedChannelId,
          })
        );
      }
    }
  } catch (error) {
    console.error("Slack guided flow response failed after opener", {
      intent,
      sourceChannelPresent: Boolean(sourceChannelId),
      message: error instanceof Error ? error.message : String(error),
    });
    response = fallbackResponseForSession(session);
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
      if (coachingThread?.id) {
        scheduleSlackBackgroundTask(
          "Slack inactivity start card failed",
          scheduleSlackInactivityStartCard({
            botAccessToken: user.botAccessToken,
            threadId: coachingThread.id,
            userId: user.id,
            channelId: postedChannelId,
          })
        );
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

  if (session && session.flow_type === "prep" && isPracticeRoleplayRequest(text)) {
    const updated = await updateSession(session.id, {
      flow_type: "practice",
      step: "ask_practice_goal",
      status: "active",
      answers: {
        ...session.answers,
        practice_goal: /pushback/i.test(text)
          ? "practice handling pushback"
          : /opening/i.test(text)
            ? "practice the opening"
            : "practice the whole conversation",
        practice_pushback: session.answers.concern || session.answers.practice_pushback || "realistic manager questions or pushback",
        extra_context: [
          ...(session.answers.extra_context || []),
          `User asked to switch from prep into role-play: ${text}`,
        ],
      },
    });
    const response = await safeCompleteSession(input, updated, text);
    await updateSession(updated.id, {
      answers: {
        ...updated.answers,
        extra_context: [
          ...(updated.answers.extra_context || []),
          PRACTICE_STARTED_MARKER,
        ],
      },
    });
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return {
      handled: true,
      title: "Practice",
      response,
      actions: guidedActions(updated),
      coachingThreadId: updated.coaching_thread_id,
    };
  }

  if (session && session.flow_type === "practice" && practiceHasStarted(session.answers)) {
    const activeSession = isPracticeStyleDetail(text)
      ? await updateSession(session.id, {
          answers: {
            ...session.answers,
            practice_pushback: [
              session.answers.practice_pushback || session.answers.concern,
              text,
            ].filter(Boolean).join(" "),
            extra_context: [
              ...(session.answers.extra_context || []),
              `Practice style/detail from user: ${text}`,
            ],
          },
        })
      : session;
    const response = await safeCompleteSession(input, activeSession, text);
    await persistGuidedTurn({ input, session: activeSession, userText: text, beckettText: response });
    return {
      handled: true,
      title: "Practice",
      response,
      actions: guidedActions(activeSession),
      coachingThreadId: activeSession.coaching_thread_id,
    };
  }

  if (session && await userMessageShouldOverrideGuidedStep(input, session, text)) {
    const mergedAnswers = {
      ...await mergeAnswersForStep(input, session, text),
      extra_context: [
        ...(session.answers.extra_context || []),
        `Latest user message to prioritize over the previous guided step: ${text}`,
      ],
    };
    const overrideFlow: GuidedFlowType = shouldSwitchToFeedbackAnalysis(text)
      ? "decode"
      : shouldSwitchToMessageDecode(text)
        ? "decode"
      : /\b(rewrite|edit|clean up|tighten)\b/i.test(text)
        ? "rewrite"
        : /\b(what should i say|how should i respond|help me reply|draft|respond|reply)\b/i.test(text)
          ? "respond"
          : (session.flow_type === "prep" || session.flow_type === "practice")
            ? "decode"
            : session.flow_type;
    const updated = await updateSession(session.id, {
      flow_type: overrideFlow,
      step: overrideFlow === "decode" ? "decode_followup" : session.step,
      status: "active",
      answers: {
        ...mergedAnswers,
        initial_request: [
          session.answers.initial_request,
          `Latest user request: ${text}`,
        ].filter(Boolean).join("\n"),
        conversation_type: shouldSwitchToFeedbackAnalysis(text)
          ? "feedback analysis"
          : shouldSwitchToMessageDecode(text)
            ? "message decode"
          : session.answers.conversation_type,
      },
    });
    const response = await safeCompleteSession(input, updated, text);
    const draftOptions = overrideFlow === "respond" ? await saveSlackDraftOptions(updated.id, response) : [];
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return {
      handled: true,
      title: flowTitle(updated.flow_type),
      response,
      actions: guidedActions(updated, draftOptions),
      coachingThreadId: updated.coaching_thread_id,
    };
  }

  if (session && shouldSwitchToFeedbackAnalysis(text)) {
    const updated = await updateSession(session.id, {
      flow_type: "decode",
      step: "decode_followup",
      status: "active",
      answers: {
        ...session.answers,
        initial_request: text,
        conversation_type: "feedback analysis",
        extra_context: [...(session.answers.extra_context || []), `User correction or feedback context: ${text}`],
      },
    });
    const response = await safeCompleteSession(input, updated, text);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return {
      handled: true,
      title: "Decode",
      response,
      actions: guidedActions(updated),
      coachingThreadId: updated.coaching_thread_id,
    };
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
    if (!CLEAR_DRAFT_REQUEST_RE.test(text)) {
      const updated = await updateSession(session.id, {
        status: "active",
        flow_type: "decode",
        answers: {
          ...session.answers,
          extra_context: [...(session.answers.extra_context || []), `Follow-up analysis question or context: ${text}`],
        },
      });
      const response = await safeCompleteSession(input, updated, text);
      await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
      return {
        handled: true,
        title: flowTitle(updated.flow_type),
        response,
        actions: guidedActions(updated),
        coachingThreadId: updated.coaching_thread_id,
      };
    }
    const updated = await updateSession(session.id, {
      status: "active",
      flow_type: "respond",
      answers: {
        ...session.answers,
        extra_context: [...(session.answers.extra_context || []), text],
      },
    });
    const response = await safeCompleteSession(input, updated, text);
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

  if (
    session.flow_type === "prep" &&
    session.status === "active" &&
    session.step === "confirm_evidence" &&
    /\b(opening|start|first line|say first)\b/i.test(text)
  ) {
    const updated = await updateSession(session.id, { step: "ask_opening_draft" });
    const response = askForStep(updated);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  if (session.step === "confirm_evidence") {
    const extra_context = Array.isArray(session.answers.extra_context) ? session.answers.extra_context : [];
    if (!isNoExtraExamples(text)) {
      extra_context.push(`User-provided example/context: ${normalizeText(text)}`);
    }

    const updated = await updateSession(session.id, {
      confirmed_evidence: [],
      answers: { ...session.answers, extra_context },
    });
    const response = await safeCompleteSession(input, updated);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  if (session.step === "ask_respond_message" || session.step === "ask_respond_context") {
    const answers = await mergeAnswersForStep(input, session, text);
    const enough = respondContextIsEnough(answers);
    const nextQuestion = enough ? "" : nextRespondContextQuestion(answers);
    if (nextQuestion) {
      const updated = await updateSession(session.id, {
        answers: {
          ...answers,
          extra_context: [
            ...(answers.extra_context || []),
            markerForRespondQuestion(nextQuestion),
          ],
        },
        step: "ask_respond_context",
      });
      await persistGuidedTurn({ input, session: updated, userText: text, beckettText: nextQuestion });
      return { handled: true, title: flowTitle(updated.flow_type), response: nextQuestion, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
    }

    const updated = await updateSession(session.id, {
      answers,
      step: session.step,
    });
    const response = await safeCompleteSession(input, updated);
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

  if (session.step === "ask_opening_draft") {
    const answers = await mergeAnswersForStep(input, session, text);
    const updated = await updateSession(session.id, {
      answers,
      step: "ask_opening_draft",
    });
    const response = await safeCompleteSession(input, updated, text);
    await persistGuidedTurn({ input, session: updated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(updated), coachingThreadId: updated.coaching_thread_id };
  }

  const answers = await mergeAnswersForStep(input, session, text);
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
    const nextUpdated =
      session.flow_type === "respond" && (nextStep === "ask_respond_message" || nextStep === "ask_respond_context")
        ? await updateSession(updated.id, {
            answers: {
              ...updated.answers,
              extra_context: [
                ...(updated.answers.extra_context || []),
                markerForRespondQuestion(response),
              ],
            },
          })
        : updated;
    await persistGuidedTurn({ input, session: nextUpdated, userText: text, beckettText: response });
    return { handled: true, title: flowTitle(session.flow_type), response, actions: guidedActions(nextUpdated), coachingThreadId: nextUpdated.coaching_thread_id };
  }

  const response = await safeCompleteSession(input, updated);
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
