import { supabaseAdmin } from "@/lib/server-admin";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  fetchSlackConversationContext,
  postSlackAgentMessage,
  runSlackCoaching,
  slackApiPost,
  SlackCoachingIntent,
  SlackConnectedUser,
  SlackConversationContext,
  slackContextUserNote,
} from "@/lib/slack-app";

type GuidedFlowType = "respond" | "rewrite" | "decode" | "prep" | "practice";
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
  source_channel_id?: string;
  source_channel_name?: string;
  audience?: string;
  outcome?: string;
  concern?: string;
  practice_goal?: string;
  practice_pushback?: string;
  extra_context?: string[];
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
};

type GuidedFlowInput = {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
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
};

type GuidedFlowResult =
  | { handled: true; response: string; title?: string }
  | { handled: false };

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
  if (/\braise\b|\bpromotion\b|\bsalary\b/.test(lower)) return "raise or promotion conversation";
  if (/\bworkload\b|\btoo much\b|\bcapacity\b|\bboundary\b|\bafter-hours\b/.test(lower)) return "workload or boundary conversation";
  if (/\bfeedback\b|\bconstructive\b/.test(lower)) return "feedback conversation";
  if (/\bclarity\b|\bunclear\b|\bclean this up\b/.test(lower)) return "clarity conversation";
  if (/\b1:1\b|\bone-on-one\b/.test(lower)) return "1:1 conversation";
  return "difficult workplace conversation";
}

function initialAnswers(
  text: string,
  flowType: GuidedFlowType,
  source?: { channelId?: string | null; channelName?: string | null }
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
    source_channel_id: source?.channelId || undefined,
    source_channel_name: source?.channelName || undefined,
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
      return "Respond with Beckett";
    case "rewrite":
      return "Rewrite with Beckett";
    case "decode":
      return "Decode with Beckett";
    case "prep":
      return "Prep with Beckett";
    case "practice":
      return "Practice with Beckett";
  }
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
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
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
}: {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  flowType: GuidedFlowType;
  answers: GuidedAnswers;
  step: GuidedStep;
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

function isLikelyTopicChange(text: string) {
  if (text.length < 24) return false;
  return isGuidedPrepRequest(text) && /\b(instead|different|new|another)\b/i.test(text);
}

function askForStep(session: SlackAgentSession) {
  const answers = session.answers;
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
        session.flow_type === "practice" ? "Let’s set up the practice." : "Let’s prep this together.",
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
    return [
      note || "I could not find enough relevant Slack history this time.",
      "",
      "We can still prep from what you told me. Reply `none` to continue without evidence, or add one detail you want included.",
    ].join("\n");
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
        "Draft options must be labeled Direct but kind, Warm and collaborative, and Concise.",
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
        "Return sections: What is visible, Possible read, What not to over-read, Next move.",
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
        "Return only these sections: Conversation goal, Talking points, Opening sentence, Likely pushback, Practice prompt, Follow-up draft.",
        "Keep it Slack-ready, concise, direct but kind, and avoid claiming unconfirmed Slack evidence as fact.",
      ].join("\n");
  }
}

async function completeSession(input: GuidedFlowInput, session: SlackAgentSession, followupText?: string) {
  const prompt = promptForFlow(session, followupText);
  const contextChannelId = input.activeChannelId || session.answers.source_channel_id || null;
  const contextChannelName = session.answers.source_channel_name || null;
  const activeContext = contextChannelId
    ? await fetchSlackConversationContext({
        accessToken: input.user.accessToken,
        channelId: contextChannelId,
        channelName: contextChannelName,
      })
    : null;
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
    responseDetail: session.flow_type === "respond" || session.flow_type === "rewrite" || session.flow_type === "decode" ? undefined : "longer",
    intent: session.flow_type,
  });

  await updateSession(session.id, { status: session.flow_type === "decode" ? "active" : "completed" });
  if (session.flow_type === "prep") {
    return ["Here’s the prep based on what you confirmed.", "", response, "", "If you want to keep practicing, reply with the part you want to rehearse."].join("\n");
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
}: StartGuidedFlowInput) {
  if (!isGuidedFlowType(intent)) return { ok: false, error: "unsupported_flow" };
  const seededPrompt = sourceChannelName
    ? `${prompt}\n\nStarted from Slack channel: #${sourceChannelName}`
    : prompt;
  const answers = initialAnswers(seededPrompt, intent, {
    channelId: sourceChannelId,
    channelName: sourceChannelName,
  });
  const step = nextStepForAnswers(intent, answers) || (intent === "decode" ? "decode_followup" : "ask_audience");
  const initialText =
    intent === "decode"
      ? "I’ll decode this privately here."
      : "I started this here so we can work through it privately, one step at a time.";
  const posted = await postSlackAgentMessage({
    botAccessToken: user.botAccessToken,
    slackUserId,
    title: flowTitle(intent),
    text: initialText,
  });

  const postedChannelId = posted.channelId;
  const postedTs = "ts" in posted ? posted.ts : undefined;
  if (!posted.ok || !postedChannelId || !postedTs) {
    const postedError = "error" in posted ? posted.error : undefined;
    return { ok: false, error: postedError || "agent_post_failed" };
  }
  const session = await createSession({
    user,
    teamId,
    slackUserId,
    channelId: postedChannelId,
    threadTs: postedTs,
    flowType: intent,
    answers,
    step,
  });
  const response = await firstSidebarResponse(
    {
      user,
      teamId,
      slackUserId,
      channelId: postedChannelId,
      threadTs: postedTs,
      text: seededPrompt,
      activeChannelId: sourceChannelId,
    },
    session
  );

  if (response && user.botAccessToken) {
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: flowTitle(intent),
      body: response,
      hideTitle: true,
    });
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: postedChannelId,
      thread_ts: postedTs,
      ...payload,
    });
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
  });

  if (session && isCancel(text)) {
    await updateSession(session.id, { status: "completed" });
    return { handled: true, title: flowTitle(session.flow_type), response: "No problem. I stopped that flow. Start a new one whenever you want." };
  }

  if (session && isStartOver(text)) {
    await updateSession(session.id, { status: "completed" });
    session = null;
  }

  if (session && isLikelyTopicChange(text)) {
    return {
      handled: true,
      title: flowTitle(session.flow_type),
      response: [
        "This sounds like a new topic.",
        "",
        "Reply `start over` to begin a new walkthrough, or answer my last question to continue the current one.",
      ].join("\n"),
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
    const created = await createSession({
      user: input.user,
      teamId: input.teamId,
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      flowType,
      answers,
      step,
    });
    return { handled: true, title: flowTitle(flowType), response: await firstSidebarResponse(input, created) };
  }

  if (session.step === "decode_followup") {
    if (/\b(done|no|stop)\b/i.test(text)) {
      await updateSession(session.id, { status: "completed" });
      return { handled: true, title: flowTitle(session.flow_type), response: "Got it. I’ll stop there." };
    }
    const updated = await updateSession(session.id, {
      status: "completed",
      flow_type: "respond",
      answers: {
        ...session.answers,
        extra_context: [...(session.answers.extra_context || []), text],
      },
    });
    return { handled: true, title: "Respond with Beckett", response: await completeSession(input, updated, text) };
  }

  if (session.step === "confirm_evidence") {
    const parsed = parseSelection(text, session.evidence_suggestions.length);
    if (parsed.type === "search_again") {
      const response = await buildEvidenceStep(input, session, text);
      return { handled: true, title: flowTitle(session.flow_type), response };
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
    return { handled: true, title: flowTitle(session.flow_type), response: await completeSession(input, updated) };
  }

  const answers = mergeAnswersForStep(session, text);
  const nextStep = nextStepForAnswers(session.flow_type, answers);
  const updated = await updateSession(session.id, {
    answers,
    step: nextStep || session.step,
  });

  if (nextStep === "confirm_evidence") {
    return { handled: true, title: flowTitle(session.flow_type), response: await buildEvidenceStep(input, updated) };
  }

  if (nextStep) {
    return { handled: true, title: flowTitle(session.flow_type), response: askForStep(updated) };
  }

  return { handled: true, title: flowTitle(session.flow_type), response: await completeSession(input, updated) };
}
