import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  buildGuestSlackContextPacket,
  buildSlackCoachingContext,
  configureSlackAgentSurface,
  fetchSlackConversationContext,
  fetchSlackBroaderContext,
  handleSlackAiError,
  isCompactSlackIntent,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  lookupSlackWorkspaceBotToken,
  resolveSlackAuthorRelationshipContext,
  runSlackGuestCoaching,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  shouldUseBroaderSlackContext,
  slackApiPost,
  type SlackCoachingIntent,
  verifySlackRequest,
} from "@/lib/slack-app";
import { handleGuidedSlackPrep, hasActiveGuidedSlackSession } from "@/lib/slack-guided-prep";
import {
  appendSlackCoachingMessage,
  buildSlackExplainMoreAction,
  buildSlackThreadArchiveAction,
  createSlackCoachingThread,
  findSlackCoachingThreadBySlackThread,
  formatSlackCoachingMessages,
  loadSlackCoachingMessages,
  loadSlackGuestPrepState,
  loadSlackGuestPracticeState,
  loadSlackGuestSelectedMessageState,
  publishSlackConnectHome,
  publishSlackHomeResult,
  recordSlackCoachingBotMessage,
  scheduleSlackInactivityStartCard,
  saveSlackGuestPrepState,
  SLACK_GUEST_PREP_PRACTICE_ACTION_ID,
  slackHistoryTitle,
  summarizeSlackCoachingResponse,
  updateSlackCoachingThread,
} from "@/lib/slack-history";
import {
  appendGuestTurn,
  formatGuestTranscript,
  loadSlackGuestSession,
  startSlackGuestSession,
  updateSlackGuestSession,
  type SlackGuestFlowType,
} from "@/lib/slack-guest-session";
import { startGuestPracticeFromPrep } from "@/lib/slack-guest-practice";
import { buildSlackPracticeUrl } from "@/lib/slack-practice-link";

export const runtime = "nodejs";

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    tab?: string;
    channel_type?: string;
    channel?: string;
    user?: string;
    bot_id?: string;
    subtype?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    action_token?: string;
    context?: {
      entities?: Array<{
        type?: string;
        value?: string;
        team_id?: string;
      }>;
    };
  };
};

function extractActiveSlackContext(event: NonNullable<SlackEventEnvelope["event"]>) {
  const channelEntity = event.context?.entities?.find((entity) =>
    entity.type?.includes("channel_id") && entity.value
  );
  const userEntity = event.context?.entities?.find((entity) =>
    entity.type?.includes("user_id") && entity.value
  );
  return {
    channelId: channelEntity?.value || null,
    userId: userEntity?.value || null,
    actionToken: event.action_token || null,
  };
}

function inferAssistantIntent(text: string): SlackCoachingIntent {
  const normalized = text.toLowerCase();
  if (/\b(relationship|history|pattern|vibe|dynamic|overall|usually|typically|how are things with|where.*stand|what.*between us|context with|relationship like|overly harsh|too harsh|mixed review|mostly critical|overly critical|was this fair|how did that land)\b/i.test(text)) {
    return "relationship";
  }
  if (normalized.includes("decode") || normalized.includes("understand this message") || normalized.includes("over-reading")) {
    return "decode";
  }
  if (normalized.includes("rewrite") || normalized.includes("clearer and kinder")) {
    return "rewrite";
  }
  if (normalized.includes("draft") || normalized.includes("respond") || normalized.includes("clear response")) {
    return "respond";
  }
  if (normalized.includes("practice")) return "practice";
  if (normalized.includes("prepare") || normalized.includes("prep")) return "prep";
  return "general";
}

function isSlackRetrievalRequest(text: string) {
  return /\b(what did we (?:decide|agree)|what was decided|did we (?:delay|move|change)|when (?:is|was|did).*launch|find (?:the|our).*decision|what happened with)\b/i.test(text);
}

function guestSessionIntent(flowType: SlackGuestFlowType): SlackCoachingIntent {
  return flowType === "retrieval" ? "general" : flowType;
}

function isAssistantStarterPrompt(text: string) {
  const normalized = text.trim().toLowerCase();
  return [
    "help me decode the current message without over-reading it.",
    "show me how to decode a specific slack message with beckett.",
    "help me decode a slack message.",
    "help me draft a clear response to the current conversation.",
    "show me how to draft a response from a specific slack message with beckett.",
    "help me draft a response to a slack message.",
    "help me rewrite my response so it is clearer and kinder.",
    "help me rewrite this draft so it is clearer and kinder.",
    "help me rewrite a draft.",
    "help me prepare for a difficult conversation.",
  ].includes(normalized);
}

function starterPromptMissingContextMessage(intent: SlackCoachingIntent) {
  if (intent === "rewrite") {
    return "Let’s work on rewriting your message. First, who is this going to and where will you send it?";
  }

  const action = intent === "respond" ? "responding to" : "decoding";
  const shortcut = intent === "respond" ? "Beckett - Respond" : "Beckett - Decode";

  return [
    `How to get my help ${action} a message:`,
    `- Click the message’s ⋯ menu and choose ‘${shortcut}’ or`,
    `- Type \`/beckett ${intent}\` in the Slack conversation you want me to use or`,
    "- Send me a Slack message link.",
  ].join("\n");
}

function slackTimestampFromPermalink(value: string | null | undefined) {
  if (!value) return null;
  const decoded = decodeURIComponent(value).trim().replace(/^p/i, "");
  if (/^\d{10,}\.\d{1,6}$/.test(decoded)) return decoded;
  const digits = decoded.replace(/\D/g, "");
  if (digits.length <= 10) return null;
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

function extractSlackPermalinkContext(text: string) {
  const normalized = text.replace(/&amp;/g, "&");
  const match = normalized.match(/https?:\/\/[^\s>|]+\/archives\/[A-Z0-9]+\/p\d{10,}(?:\?[^\s>|]+)?/i);
  if (!match) return null;

  try {
    const url = new URL(match[0]);
    const parts = url.pathname.split("/").filter(Boolean);
    const archiveIndex = parts.indexOf("archives");
    const channelId = archiveIndex >= 0 ? parts[archiveIndex + 1] : null;
    const messagePath = archiveIndex >= 0 ? parts[archiveIndex + 2] : null;
    const messageTs = slackTimestampFromPermalink(messagePath);
    const threadTs = slackTimestampFromPermalink(url.searchParams.get("thread_ts"));

    if (!channelId || !messageTs) return null;
    return {
      channelId,
      messageTs,
      threadTs,
      url: match[0],
    };
  } catch {
    return null;
  }
}

function responseDetailForSlackIntent(intent: SlackCoachingIntent) {
  if (isCompactSlackIntent(intent)) return "quick";
  if (intent === "prep" || intent === "practice") return "longer";
  return undefined;
}

function flowTypeAsSlackIntent(flowType: string | null | undefined, fallback: SlackCoachingIntent): SlackCoachingIntent {
  if (
    fallback === "respond" ||
    fallback === "rewrite" ||
    fallback === "relationship" ||
    fallback === "prep" ||
    fallback === "practice"
  ) {
    return fallback;
  }
  if (
    flowType === "respond" ||
    flowType === "rewrite" ||
    flowType === "decode" ||
    flowType === "relationship" ||
    flowType === "prep" ||
    flowType === "practice"
  ) {
    return flowType;
  }
  return fallback;
}

function continuationIntentForText(text: string, currentIntent: SlackCoachingIntent): SlackCoachingIntent {
  const normalized = text.toLowerCase();
  if (/\b(what should i say|how should i respond|how should i reply|help me respond|help me reply|draft|reply option|response option|direct option|warm option|concise option|make .*option|say back|respond to this|reply to this)\b/.test(normalized)) {
    return "respond";
  }
  if (/\b(rewrite|edit|tighten|clean up|make it clearer|clearer and kinder)\b/.test(normalized)) {
    return "rewrite";
  }
  if (/\b(overly harsh|too harsh|mixed review|mostly critical|overly critical|was this fair|how did that land|relationship|vibe|dynamic|pattern)\b/.test(normalized)) {
    return "relationship";
  }
  return currentIntent;
}

function guestIntentFromExactThread(context: string, fallback: SlackCoachingIntent): SlackCoachingIntent {
  if (/\b(let'?s practice|practice the whole conversation|role-?play|you be my|what do you say first|i['’]ll be (?:your|the))\b/i.test(context)) {
    return "practice";
  }
  if (/\b(let'?s prep|prepare for (?:a|this) conversation|prep this conversation)\b/i.test(context)) {
    return "prep";
  }
  return fallback;
}

function guestPracticePrompt(text: string, context: string) {
  const practiceStarted = /\b(go ahead.{0,40}what do you say|what do you say first|role-?play (?:has )?started|i['’]ll be (?:your|the)|you be my manager)\b/i.test(context);
  if (!practiceStarted) return text;
  if (/\b(how did that sound|was that okay|coach me|feedback|what should i change|try again)\b/i.test(text)) {
    return `The role-play is already in progress. Pause in-character role-play, coach the user's latest line, then invite them to continue. Latest user line: ${text}`;
  }
  return `The role-play is already in progress. Continue in character as the other person from the exact Slack thread. Respond directly to the user's latest in-character line with one concise realistic turn. Do not restart setup and do not ask what they want to focus on. Latest user line: ${text}`;
}

function guestPrepPrompt(text: string) {
  if (/\b(intro|intros|opening|openers|first line|how (?:do|should) i start|what should i say first)\b/i.test(text)) {
    return `The user is in an active guided Prep thread and directly asked for opening lines. Give exactly 3 concise Slack-ready openings: Direct, Collaborative, and Concise. Use the person, goal, and concern already present in the exact thread. Do not recap the setup, ask them to choose a focus, or add more than one short closing question. Latest request: ${text}`;
  }
  return `Continue the active guided Prep flow using only this exact Slack thread. Follow this order: (1) person and situation, (2) desired outcome, (3) concern or likely pushback, (4) concise final prep. Identify which fields the user has already answered in the thread and ask only the earliest missing question. If all three are present, give a short prep with Goal, Say this first, If they push back, and Practice next. Do not recap prior answers, offer a long menu, add generic reassurance, or invent a different flow. Latest user answer: ${text}`;
}

function isDirectGuestPrepRequest(text: string) {
  return /\b(intro|intros|opening|openers|first line|how (?:do|should) i start|what should i say|draft|example|examples|practice)\b/i.test(text);
}

function isConversationLocationAdviceRequest(text: string) {
  return /\b(where|which (?:format|medium|channel)|slack or|zoom or|call or|in person or).{0,50}\b(?:have|hold|do|happen|best|better|conversation|talk)\b|\bshould (?:this|the|we|i).{0,40}\b(?:slack|zoom|call|in person|written)\b/i.test(text);
}

function recommendGuestConversationLocation(personAndSituation: string, request: string) {
  const context = `${personAndSituation} ${request}`.toLowerCase();
  if (/\b(document|record|details|instructions|simple update|quick question|link|status)\b/.test(context)) {
    return { location: "written" as const, response: "I’d recommend Slack or another written message. This sounds specific enough to handle clearly in writing, and you’ll both have a record to refer back to. Does that work for you?" };
  }
  if (/\b(sensitive|conflict|performance|feedback|overwhelm|workload|raise|promotion|misunderstand|emotional|pushback)\b/.test(context)) {
    return { location: "call" as const, response: "I’d recommend a video or phone call. This topic may need back-and-forth and gives you both room to clarify tone before anything is misunderstood. Does that work for you?" };
  }
  return { location: "call" as const, response: "I’d lean toward a short call because it allows quick back-and-forth. If the topic is simple or you mainly need a written record, Slack could work instead. Does a call fit the situation?" };
}

function inferGuestConversationLocation(text: string): "written" | "call" | "in_person" | null {
  if (/\b(slack|message|dm|direct message|channel|email|chat|written|text)\b/i.test(text)) return "written";
  if (/\b(zoom|meet|teams|video|phone|call|virtual|facetime)\b/i.test(text)) return "call";
  if (/\b(in[ -]?person|face[ -]?to[ -]?face|at the office|over coffee|when i see|meet in person)\b/i.test(text)) return "in_person";
  return null;
}

function guestLocationLabel(location: "written" | "call" | "in_person") {
  if (location === "written") return "Slack or another written message";
  if (location === "call") return "a video or phone call";
  return "in person";
}

function isPracticeStopRequest(text: string) {
  return /\b(stop practice|stop role-?play|pause|give me feedback|how did i do|coach me|end practice)\b/i.test(text);
}

function slackHistoryFailureMessage(reason: string | null | undefined) {
  switch (reason) {
    case "missing_token":
      return "Slack is not connected for this account. Connect Slack from Beckett Settings, then try again.";
    case "missing_scope":
      return "I’m missing the Slack permissions needed to read this conversation. Reconnect Slack from Beckett Settings, then reinstall or reauthorize the Slack app if prompted.";
    case "feature_not_enabled":
      return "Slack broader search is not enabled for this app or workspace yet. I can still use selected messages and linked Slack threads.";
    case "not_in_channel":
      return "I do not have access to that channel or DM. Add Beckett to the channel, use a conversation I’m authorized to read, or paste the message here.";
    case "channel_not_found":
      return "I could not find that Slack channel or conversation. Check that the link is from the connected workspace.";
    case "no_messages":
      return "I could open the conversation, but Slack did not return readable messages. Try linking a specific message or thread.";
    default:
      return "Slack returned an error while I was trying to read this context. Try again, or reconnect Slack if this keeps happening.";
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody || "{}") as SlackEventEnvelope;

  if (body.type === "url_verification" && body.challenge) {
    return new NextResponse(body.challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const event = body.event;
  if (
    body.type === "event_callback" &&
    event?.type === "app_home_opened" &&
    event.user
  ) {
    if (!event.tab || event.tab === "home") {
      scheduleSlackBackgroundTask(
        "Slack app home publish failed",
        publishHome({
          teamId: body.team_id || "",
          slackUserId: event.user,
        })
      );
    }

    if (!event.tab || event.tab === "messages") {
      scheduleSlackBackgroundTask(
        "Slack agent surface setup failed",
        setupMessagesSurface({
          teamId: body.team_id || "",
          slackUserId: event.user,
          channelId: event.channel,
        })
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.type !== "event_callback" ||
    event?.type !== "message" ||
    event.channel_type !== "im" ||
    !event.user ||
    !event.channel ||
    !event.text ||
    event.bot_id ||
    event.subtype
  ) {
    return NextResponse.json({ ok: true });
  }

  const activeSlackContext = extractActiveSlackContext(event);
  scheduleSlackBackgroundTask(
    "Slack agent message response failed",
    respondToAgentMessage({
      teamId: body.team_id || "",
      slackUserId: event.user,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts || "",
      text: event.text,
      activeChannelId: activeSlackContext.channelId,
      activeUserId: activeSlackContext.userId,
      actionToken: activeSlackContext.actionToken,
      isThreadReply: Boolean(event.thread_ts),
    })
  );

  return NextResponse.json({ ok: true });
}

async function setupMessagesSurface({
  teamId,
  slackUserId,
  channelId,
}: {
  teamId: string;
  slackUserId: string;
  channelId?: string;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken || !isAllowedSlackPlan(user)) {
    const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
      console.error("Slack workspace bot token lookup for Messages failed", {
        teamPresent: Boolean(teamId),
        slackUserPresent: Boolean(slackUserId),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!botAccessToken) return;

    await configureSlackAgentSurface({
      botAccessToken,
      slackUserId,
      channelId,
    });
    return;
  }

  await configureSlackAgentSurface({
    botAccessToken: user.botAccessToken,
    slackUserId,
    channelId,
  });
}

async function publishHome({
  teamId,
  slackUserId,
}: {
  teamId: string;
  slackUserId: string;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken || !isAllowedSlackPlan(user)) {
    const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
      console.error("Slack workspace bot token lookup for Home failed", {
        teamPresent: Boolean(teamId),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    await publishSlackConnectHome({
      botAccessToken,
      slackUserId,
      settingsUrl: "https://www.meetbeckett.co/dashboard/settings",
    });
    return;
  }

  await publishSlackHomeResult({
    botAccessToken: user.botAccessToken,
    slackUserId,
    userId: user.id,
  });
}

async function continueExistingSlackCoachingThread({
  user,
  teamId,
  slackUserId,
  channelId,
  threadTs,
  text,
  intent,
}: {
  user: NonNullable<Awaited<ReturnType<typeof lookupSlackConnectedUser>>>;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  intent: SlackCoachingIntent;
}) {
  const thread = await findSlackCoachingThreadBySlackThread({
    userId: user.id,
    teamId,
    slackUserId,
    channelId,
    threadTs,
  });
  if (!thread) return null;

  const previousMessages = await loadSlackCoachingMessages({
    threadId: thread.id,
    userId: user.id,
    limit: 30,
  }).catch(() => []);
  const transcript = formatSlackCoachingMessages(previousMessages, 6000);
  const hasSavedShortcutContext = previousMessages.some((message) =>
    /Shortcut source context saved for follow-up:/i.test(message.content)
  );
  const prompt = [
    `The user is continuing this Beckett coaching thread: ${thread.title}.`,
    thread.summary ? `Current summary: ${thread.summary}` : "",
    transcript ? `Previous conversation:\n${transcript}` : "",
    hasSavedShortcutContext
      ? "Important: This thread includes saved source context from the original Slack message shortcut. Use that selected message and surrounding context for follow-up requests. Do not ask the user to paste the original message again unless the saved source context is actually absent."
      : "",
    "",
    `User follow-up: ${text}`,
  ].filter(Boolean).join("\n");

  await appendSlackCoachingMessage({
    threadId: thread.id,
    user,
    teamId,
    slackUserId,
    role: "user",
    content: text,
  }).catch(() => null);

  const threadIntent = continuationIntentForText(text, flowTypeAsSlackIntent(thread.flow_type, intent));

  const response = await runSlackCoaching({
    user,
    action: "agent_message",
    prompt,
    sourceLabel: thread.title,
    messageText: transcript || thread.summary || thread.prompt_snippet || text,
    contextStatus: "available",
    contextMessageCount: previousMessages.length,
    broaderSearchUsed: false,
    intent: threadIntent,
    responseDetail: responseDetailForSlackIntent(threadIntent),
  });

  await appendSlackCoachingMessage({
    threadId: thread.id,
    user,
    teamId,
    slackUserId,
    role: "beckett",
    content: response,
  }).catch(() => null);
  await updateSlackCoachingThread(thread.id, {
    summary: summarizeSlackCoachingResponse(response, thread.summary || thread.prompt_snippet || text),
  }).catch(() => null);

  return { thread, response };
}

async function postSlackCoachingContinuation({
  user,
  channelId,
  threadTs,
  continuation,
}: {
  user: NonNullable<Awaited<ReturnType<typeof lookupSlackConnectedUser>>>;
  channelId: string;
  threadTs: string;
  continuation: NonNullable<Awaited<ReturnType<typeof continueExistingSlackCoachingThread>>>;
}) {
  const botAccessToken = user.botAccessToken;
  if (!botAccessToken) return;
  const payload = buildBeckettPayload({
    title: "Beckett",
    subtitle: "",
    body: continuation.response,
    hideTitle: true,
  });

  const posted = await slackApiPost<{ ts?: string }>(botAccessToken, "chat.postMessage", {
    channel: channelId,
    thread_ts: threadTs,
    ...payload,
  });
  if (posted.ok && posted.ts) {
    await recordSlackCoachingBotMessage({
      threadId: continuation.thread.id,
      userId: user.id,
      channelId,
      messageTs: posted.ts,
      kind: "reply",
    }).catch(() => null);
    scheduleSlackBackgroundTask(
      "Slack inactivity start card failed",
      scheduleSlackInactivityStartCard({
        botAccessToken,
        threadId: continuation.thread.id,
        userId: user.id,
        channelId,
      })
    );
  }
  await slackApiPost(botAccessToken, "assistant.threads.setStatus", {
    channel_id: channelId,
    thread_ts: threadTs,
    status: "",
  }).catch(() => null);
}

async function respondToAgentMessage({
  teamId,
  slackUserId,
  channelId,
  threadTs,
  text,
  activeChannelId,
  activeUserId,
  actionToken,
  isThreadReply,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  activeUserId?: string | null;
  actionToken?: string | null;
  isThreadReply?: boolean;
}) {
  const assistantIntent = inferAssistantIntent(text);
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken) {
    const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
      console.error("Slack workspace bot token lookup failed", {
        teamPresent: Boolean(teamId),
        slackUserPresent: Boolean(slackUserId),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (botAccessToken) {
      try {
        let guestSession = await loadSlackGuestSession({
          teamId,
          slackUserId,
          channelId,
          threadTs,
        }).catch(() => null);
        const selectedMessageState = await loadSlackGuestSelectedMessageState({
          teamId,
          slackUserId,
          threadTs,
        }).catch(() => null);
        const linkedSlackContext = extractSlackPermalinkContext(text);
        const sessionSource = guestSession?.source;
        const sourceChannelId = linkedSlackContext?.channelId || sessionSource?.channelId || selectedMessageState?.sourceChannelId;
        const sourceThreadTs = linkedSlackContext
          ? linkedSlackContext.threadTs || undefined
          : sessionSource?.channelId
            ? sessionSource.threadTs
            : selectedMessageState?.sourceChannelId
              ? selectedMessageState.sourceThreadTs
              : threadTs;
        const guestContext = await buildGuestSlackContextPacket({
          botAccessToken,
          channelId: sourceChannelId || activeChannelId || channelId,
          channelName: sessionSource?.channelName || selectedMessageState?.sourceChannelName,
          selectedMessageTs: linkedSlackContext?.messageTs || sessionSource?.messageTs || selectedMessageState?.sourceMessageTs,
          // A normal assistant reply may only inherit context from its exact
          // Slack thread. Linked conversations retain their linked thread.
          threadTs: sourceThreadTs,
          selectedMessageText: sessionSource?.message || selectedMessageState?.message || (isAssistantStarterPrompt(text) ? "" : text),
          userRequest: text,
          currentSlackUserId: slackUserId,
        });
        const durableSelectedContext = selectedMessageState
          ? [
              `Active ${selectedMessageState.intent} task. Continue this task unless the user explicitly changes it.`,
              `The requester selected a message written by ${selectedMessageState.author}. Do not attribute it to the requester.`,
              `Selected message: ${selectedMessageState.message}`,
              selectedMessageState.context ? `Saved source context:\n${selectedMessageState.context}` : "",
            ].filter(Boolean).join("\n")
          : "";
        const sessionTranscript = formatGuestTranscript(guestSession?.transcript);
        const sessionContext = guestSession
          ? [
              `Active ${guestSession.flow_type} task in this exact Beckett thread. Continue it unless the user explicitly changes tasks.`,
              guestSession.source?.author ? `Selected-message author: ${guestSession.source.author}. Do not attribute their message to the requester.` : "",
              guestSession.source?.message ? `Selected message: ${guestSession.source.message}` : "",
              guestSession.artifacts?.latestResponse ? `Latest saved Beckett result: ${String(guestSession.artifacts.latestResponse)}` : "",
              sessionTranscript ? `Exact thread transcript:\n${sessionTranscript}` : "",
            ].filter(Boolean).join("\n")
          : "";
        let messageText = [
          sessionContext,
          durableSelectedContext,
          isAssistantStarterPrompt(text) ? guestContext.text : guestContext.text || text,
        ].filter(Boolean).join("\n\n");
        const inferredFlow: SlackGuestFlowType = isSlackRetrievalRequest(text)
          ? "retrieval"
          : (selectedMessageState?.intent || guestIntentFromExactThread(messageText, assistantIntent)) as SlackGuestFlowType;
        const flowType = guestSession?.flow_type || inferredFlow;
        const intent = guestSession ? guestSessionIntent(guestSession.flow_type) : guestSessionIntent(flowType);
        if (!guestSession && ["decode", "respond", "rewrite", "prep", "practice", "retrieval"].includes(flowType)) {
          guestSession = await startSlackGuestSession({
            teamId,
            slackUserId,
            channelId,
            threadTs,
            flowType,
            source: linkedSlackContext
              ? { channelId: linkedSlackContext.channelId, messageTs: linkedSlackContext.messageTs, threadTs: linkedSlackContext.threadTs || undefined }
              : undefined,
            state: flowType === "prep" ? { step: "person" } : { step: "active" },
            transcript: [{ role: "user", content: text }],
          }).catch(() => null);
        }
        if (flowType === "retrieval") {
          const searchContext = await fetchSlackBroaderContext({
            accessToken: botAccessToken,
            prompt: text,
            contextChannelId: activeChannelId || undefined,
            actionToken,
            currentSlackUserId: slackUserId,
          }).catch(() => null);
          messageText = [
            messageText,
            searchContext?.text ? `Live Slack search results:\n${searchContext.text}` : "No usable live Slack search results were returned.",
          ].filter(Boolean).join("\n\n");
        }
        const guestPrompt = intent === "practice"
          ? guestPracticePrompt(text, messageText)
          : intent === "prep"
            ? guestPrepPrompt(text)
            : text;
        const prepState = intent === "prep"
          ? await loadSlackGuestPrepState({ teamId, slackUserId, threadTs }).catch(() => null)
          : null;
        const practiceState = await loadSlackGuestPracticeState({ teamId, slackUserId, threadTs }).catch(() => null);
        let response: string;
        let actions: Record<string, unknown>[] | undefined;
        if (
          prepState?.step === "complete" &&
          intent === "prep" &&
          /\b(?:let'?s|can we|i(?:'d| would) like to|start) practice\b|\bpractice (?:this|the|our) conversation\b/i.test(text)
        ) {
          const practice = await startGuestPracticeFromPrep({ teamId, slackUserId, channelId, prepThreadTs: threadTs });
          response = practice.ok
            ? practice.permalink
              ? `I opened a fresh Practice conversation. <${practice.permalink}|Open it in Slack>.`
              : "I opened a fresh Practice conversation in Beckett."
            : "I couldn’t open the Practice conversation. Please use the Practice button in this Prep thread.";
        } else if (practiceState) {
          const stopping = isPracticeStopRequest(text);
          response = await runSlackGuestCoaching({
            teamId,
            slackUserId,
            action: "agent_message",
            prompt: [
              stopping
                ? "The user has paused or ended the role-play. Step out of character and give brief, concrete feedback on their most recent responses, then offer one retry."
                : "Continue the active role-play. Respond only as the other person with one realistic, concise turn. Stay in character. Do not analyze, recap, coach, praise, or restart setup unless the user explicitly pauses or asks for feedback.",
              `You are role-playing as: ${practiceState.person}`,
              `Conversation location: ${guestLocationLabel(practiceState.location)}. Tailor the interaction to this medium.`,
              `User's desired outcome: ${practiceState.outcome}`,
              `Concern the user is preparing for: ${practiceState.concern}`,
              "Treat that concern as an instruction for how your character should respond. Express the concern through realistic questions, hesitation, competing priorities, skepticism, or pushback at the first natural opportunity.",
              "Do not be instantly accommodating, solve the problem for the user, or agree with every conclusion. Make the user explain, advocate, clarify, or negotiate while remaining professionally realistic rather than hostile.",
              "Respond only to the user's latest words. Never answer a question that your character asked in the previous turn, and never invent something the user said.",
              `Latest user turn: ${text}`,
            ].join("\n"),
            messageText,
            intent: "practice",
          });
        } else if (flowType === "rewrite" && !guestSession?.source?.message && !guestSession?.state?.draft && !isAssistantStarterPrompt(text)) {
          if (guestSession) {
            guestSession = await updateSlackGuestSession(guestSession, {
              state: { ...guestSession.state, draft: text },
            });
          }
          response = "How would you like me to change this draft—for example, make it warmer, more direct, shorter, or more confident?";
        } else if (flowType === "rewrite" && guestSession?.state?.draft) {
          response = await runSlackGuestCoaching({
            teamId,
            slackUserId,
            action: "agent_message",
            prompt: [
              "Rewrite the saved draft using the user's latest instruction.",
              `Saved draft: ${String(guestSession.state.draft)}`,
              `Latest instruction: ${text}`,
              "Return exactly three concise options with useful tone labels. Do not ask another question.",
            ].join("\n"),
            messageText,
            intent: "rewrite",
          });
        } else if (!prepState && intent === "prep" && isAssistantStarterPrompt(text)) {
          await saveSlackGuestPrepState({
            teamId,
            slackUserId,
            state: { threadTs, step: "person" },
          });
          response = [
            "Let’s prep this conversation together.",
            "",
            "First, who are you talking to, and what is the conversation about?",
            "You can describe their role or tag them with @.",
          ].join("\n");
        } else if (prepState && prepState.step !== "complete" && !isDirectGuestPrepRequest(text)) {
          if (prepState.step === "person") {
            const inferredLocation = inferGuestConversationLocation(text);
            await saveSlackGuestPrepState({
              teamId,
              slackUserId,
              state: {
                ...prepState,
                person: text,
                location: inferredLocation || undefined,
                step: inferredLocation ? "outcome" : "location",
              },
            });
            response = inferredLocation
              ? "What outcome do you want from the conversation? What would a good result look like?"
              : [
                  "Where will this conversation happen?",
                  "Choose Slack or another written message, a video or phone call, or in person.",
                ].join("\n");
          } else if (prepState.step === "location") {
            const recommendedLocation = guestSession?.state?.recommendedLocation;
            const acceptedRecommendation = typeof recommendedLocation === "string" && /^(?:yes|yeah|yep|sure|that works|sounds good|okay|ok)\b/i.test(text.trim());
            const location = acceptedRecommendation
              ? recommendedLocation as "written" | "call" | "in_person"
              : inferGuestConversationLocation(text);
            if (isConversationLocationAdviceRequest(text)) {
              const recommendation = recommendGuestConversationLocation(prepState.person || "", text);
              if (guestSession) {
                guestSession = await updateSlackGuestSession(guestSession, {
                  state: { ...guestSession.state, recommendedLocation: recommendation.location, locationStatus: "recommended" },
                });
              }
              response = recommendation.response;
            } else if (!location) {
              response = "Will this happen in a written message, on a video or phone call, or in person?";
            } else {
              await saveSlackGuestPrepState({
                teamId,
                slackUserId,
                state: { ...prepState, location, step: "outcome" },
              });
              response = "What outcome do you want from the conversation? What would a good result look like?";
            }
          } else if (prepState.step === "outcome") {
            await saveSlackGuestPrepState({
              teamId,
              slackUserId,
              state: { ...prepState, outcome: text, step: "concern" },
            });
            response = "What are you most concerned they may misunderstand, push back on, or react poorly to?";
          } else {
            const completedState = { ...prepState, concern: text, step: "complete" as const };
            await saveSlackGuestPrepState({ teamId, slackUserId, state: completedState });
            response = await runSlackGuestCoaching({
              teamId,
              slackUserId,
              action: "agent_message",
              prompt: [
                "Create the final concise guided Prep now. All required questions have been answered.",
                `Person and situation: ${completedState.person || "not specified"}`,
                `Conversation location: ${guestLocationLabel(completedState.location || "call")}`,
                `Desired outcome: ${completedState.outcome || "not specified"}`,
                `Concern or pushback: ${completedState.concern}`,
                "Tailor the wording and delivery guidance to the conversation location.",
                "Use only: Goal, Say this first, If they push back.",
                "Do not ask another setup or clarification question.",
                "Do not include a Practice next section or a practice question; the interface adds it.",
              ].join("\n"),
              messageText,
              intent: "prep",
            });
            response = `${response.trim()}\n\nWould you like to practice the conversation?`;
            const practiceUrl = buildSlackPracticeUrl({ teamId, slackUserId, channelId, prepThreadTs: threadTs });
            actions = [{
              type: "button",
              text: { type: "plain_text", text: "Practice conversation" },
              style: "primary",
              action_id: SLACK_GUEST_PREP_PRACTICE_ACTION_ID,
              value: JSON.stringify({ prepThreadTs: threadTs, direct: Boolean(practiceUrl) }),
              ...(practiceUrl ? { url: practiceUrl } : {}),
            }];
          }
        } else {
          response = await runSlackGuestCoaching({
            teamId,
            slackUserId,
            action: "agent_message",
            prompt: guestPrompt,
            messageText,
            intent,
          });
        }
        const payload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          body: response,
          footer: "Guest mode • Connect Beckett for personalized context.",
          actions,
          hideTitle: true,
        });

        const posted = await slackApiPost(botAccessToken, "chat.postMessage", {
          channel: channelId,
          thread_ts: threadTs,
          ...payload,
        });
        if (guestSession) {
          let transcript = guestSession.transcript || [];
          if (transcript.at(-1)?.role !== "user" || transcript.at(-1)?.content !== text) {
            transcript = appendGuestTurn(transcript, "user", text);
          }
          transcript = appendGuestTurn(transcript, "beckett", response);
          const latestPrep = intent === "prep"
            ? await loadSlackGuestPrepState({ teamId, slackUserId, threadTs }).catch(() => null)
            : null;
          await updateSlackGuestSession(guestSession, {
            transcript,
            artifacts: { ...guestSession.artifacts, latestResponse: response },
            ...(latestPrep ? { state: { ...guestSession.state, ...latestPrep } } : {}),
          }).catch(() => null);
        }
        if (posted.ok) {
          scheduleSlackBackgroundTask(
            "Slack guest inactivity start card failed",
            scheduleSlackInactivityStartCard({ botAccessToken, channelId })
          );
        }
        return;
      } catch (error) {
        const payload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "Could not finish that request",
          body: handleSlackAiError(error),
          hideTitle: true,
        });
        await slackApiPost(botAccessToken, "chat.postMessage", {
          channel: channelId,
          thread_ts: threadTs,
          ...payload,
        });
        return;
      }

    }

    console.error("Slack agent message ignored because no connected user or workspace bot token was found", {
      teamPresent: Boolean(teamId),
      slackUserPresent: Boolean(slackUserId),
      channelPresent: Boolean(channelId),
    });
    return;
  }

  if (!isAllowedSlackPlan(user)) {
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      text: "Beckett Slack coaching is available for beta and pro users.",
    });
    return;
  }

  try {
    await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "thinking through the conversation...",
    }).catch(() => null);

    const activeContext = activeChannelId
      ? await fetchSlackConversationContext({
          accessToken: user.accessToken,
          channelId: activeChannelId,
        })
      : null;
    const activeRelationship = await resolveSlackAuthorRelationshipContext({
      user,
      teamId,
      slackAuthorUserId: activeUserId,
      interactionType: "slack_agent_message",
    });

    // A reply inside a saved shortcut/coaching thread should continue that
    // conversation before broad trigger words are allowed to start a new flow.
    // Active guided sessions retain priority so their step-by-step state works.
    const hasActiveGuidedSession = await hasActiveGuidedSlackSession({
      teamId,
      slackUserId,
      channelId,
      threadTs,
    });
    if (!hasActiveGuidedSession) {
      const savedContinuation = await continueExistingSlackCoachingThread({
        user,
        teamId,
        slackUserId,
        channelId,
        threadTs,
        text,
        intent: assistantIntent,
      });
      if (savedContinuation) {
        await postSlackCoachingContinuation({
          user,
          channelId,
          threadTs,
          continuation: savedContinuation,
        });
        return;
      }
    }

    const guidedPrep = await handleGuidedSlackPrep({
      user,
      teamId,
      slackUserId,
      channelId,
      threadTs,
      text,
      activeChannelId,
      activeContext,
      relationshipContext: activeRelationship?.promptContext || null,
      actionToken,
    });

    if (guidedPrep.handled) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: guidedPrep.response,
        actions: guidedPrep.actions,
      });

      const postedGuided = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      if (postedGuided.ok && postedGuided.ts) {
        await recordSlackCoachingBotMessage({
          threadId: guidedPrep.coachingThreadId,
          userId: user.id,
          channelId,
          messageTs: postedGuided.ts,
          kind: "reply",
        }).catch(() => null);
        if (guidedPrep.coachingThreadId) {
          scheduleSlackBackgroundTask(
            "Slack inactivity start card failed",
            scheduleSlackInactivityStartCard({
              botAccessToken: user.botAccessToken,
              threadId: guidedPrep.coachingThreadId,
              userId: user.id,
              channelId,
            })
          );
        }
      }

      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
      return;
    }

    const continuedThread = await continueExistingSlackCoachingThread({
      user,
      teamId,
      slackUserId,
      channelId,
      threadTs,
      text,
      intent: assistantIntent,
    });
    if (continuedThread) {
      await postSlackCoachingContinuation({
        user,
        channelId,
        threadTs,
        continuation: continuedThread,
      });
      return;
    }

    const linkedSlackContext = extractSlackPermalinkContext(text);
    if (linkedSlackContext) {
      const linkedContext = await fetchSlackConversationContext({
        accessToken: user.accessToken,
        channelId: linkedSlackContext.channelId,
        messageTs: linkedSlackContext.messageTs,
        threadTs: linkedSlackContext.threadTs,
      });
      console.info("Slack linked context retrieval", {
        linkParsed: true,
        channelPrefix: linkedSlackContext.channelId.slice(0, 1),
        hasThreadTs: Boolean(linkedSlackContext.threadTs),
        status: linkedContext.status,
        failureReason: linkedContext.failureReason,
        messageCount: linkedContext.messageCount,
        retrievalMethod: linkedContext.retrievalMethod || null,
        grantedUserScopes: user.grantedUserScopes,
        missingUserScopes: user.missingUserScopes,
      });

      if (linkedContext.status !== "available" || !linkedContext.text) {
        const payload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          body: slackHistoryFailureMessage(linkedContext.failureReason),
          hideTitle: true,
        });

        await slackApiPost(user.botAccessToken, "chat.postMessage", {
          channel: channelId,
          thread_ts: threadTs,
          ...payload,
        });
        await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
          channel_id: channelId,
          thread_ts: threadTs,
          status: "",
        }).catch(() => null);
        return;
      }

      const linkIntent = assistantIntent === "general" ? "decode" : assistantIntent;
      const prompt = [
        "The user sent a Slack conversation link so I can recover the relevant context for this Beckett thread.",
        "Use the linked Slack conversation as the source context.",
        "Also use relevant prior Slack history if it is available, but do not block the answer if broader history is unavailable.",
        linkIntent === "relationship"
          ? "If the user asked a relationship or history question, answer that question directly from the linked visible context. Do not ask for an exact message or add a Next move unless the user asks what to say next."
          : "If the user included a follow-up question with the link, answer that question. If they only sent the link, give a concise read and next move.",
        linkedContext.messageCount <= 1
          ? "Important: I could only retrieve one visible message from the direct link. Be clear that the context is limited."
          : "",
        "",
        `User message: ${text}`,
      ].filter(Boolean).join("\n");
      const linkedCoachingContext = await buildSlackCoachingContext({
        user,
        prompt,
        activeContext: linkedContext,
        contextChannelId: linkedSlackContext.channelId,
        actionToken,
        includeBroaderContext: true,
        relevantSlackUserIds: activeUserId ? [activeUserId] : [],
        currentSlackUserId: slackUserId,
      });
      console.info("Slack linked broader context retrieval", {
        linkParsed: true,
        activeMessageCount: linkedContext.messageCount,
        activeRetrievalMethod: linkedContext.retrievalMethod || null,
        combinedStatus: linkedCoachingContext.status,
        combinedFailureReason: linkedCoachingContext.failureReason,
        combinedMessageCount: linkedCoachingContext.messageCount,
        broaderSearchUsed: linkedCoachingContext.broaderSearchUsed,
      });
      const response = await runSlackCoaching({
        user,
        action: "agent_message",
        prompt,
        sourceLabel: "linked_slack_conversation",
        messageText: linkedCoachingContext.text || linkedContext.text,
        contextStatus: linkedCoachingContext.status,
        contextFailureReason: linkedCoachingContext.failureReason,
        contextMessageCount: linkedCoachingContext.messageCount || linkedContext.messageCount,
        broaderSearchUsed: linkedCoachingContext.broaderSearchUsed,
        relationshipContext: activeRelationship?.promptContext || null,
        intent: linkIntent,
        responseDetail: responseDetailForSlackIntent(linkIntent),
      });
      const coachingThread = await createSlackCoachingThread({
        user,
        teamId,
        slackUserId,
        flowType:
          linkIntent === "respond" ||
          linkIntent === "rewrite" ||
          linkIntent === "decode" ||
          linkIntent === "relationship" ||
          linkIntent === "prep" ||
          linkIntent === "practice"
            ? linkIntent
            : "message",
        title: slackHistoryTitle(
            linkIntent === "respond" ||
            linkIntent === "rewrite" ||
            linkIntent === "decode" ||
            linkIntent === "relationship" ||
            linkIntent === "prep" ||
            linkIntent === "practice"
            ? linkIntent
            : "message",
          "linked Slack conversation"
        ),
        promptSnippet: text,
        summary: summarizeSlackCoachingResponse(response, text),
        slackChannelId: channelId,
        threadTs,
        sourceChannelId: linkedSlackContext.channelId,
        status: "active",
      }).catch((error) => {
        console.error("Slack linked coaching history create failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (coachingThread?.id) {
        await appendSlackCoachingMessage({
          threadId: coachingThread.id,
          user,
          teamId,
          slackUserId,
          role: "user",
          content: text,
        }).catch(() => null);
        await appendSlackCoachingMessage({
          threadId: coachingThread.id,
          user,
          teamId,
          slackUserId,
          role: "beckett",
          content: response,
        }).catch(() => null);
      }

      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: [
          linkedContext.messageCount <= 1
            ? "I found the linked Slack conversation, but I could only see 1 message. Reply in this thread so I can keep the context and follow-ups saved together."
            : "I found the linked Slack conversation. Reply in this thread so I can keep the context and follow-ups saved together.",
          "",
          response,
        ].join("\n"),
        hideTitle: true,
        actions: [
          ...(isCompactSlackIntent(linkIntent) ? buildSlackExplainMoreAction(coachingThread?.id) : []),
          ...buildSlackThreadArchiveAction(coachingThread?.id),
        ],
      });

      const postedLinkedResponse = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      if (postedLinkedResponse.ok && postedLinkedResponse.ts) {
        await recordSlackCoachingBotMessage({
          threadId: coachingThread?.id,
          userId: user.id,
          channelId,
          messageTs: postedLinkedResponse.ts,
          kind: "reply",
        }).catch(() => null);
        if (coachingThread?.id) {
          scheduleSlackBackgroundTask(
            "Slack inactivity start card failed",
            scheduleSlackInactivityStartCard({
              botAccessToken: user.botAccessToken,
              threadId: coachingThread.id,
              userId: user.id,
              channelId,
            })
          );
        }
      }

      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
      return;
    }

    const coachingContext = await buildSlackCoachingContext({
      user,
      prompt: text,
      activeContext,
      contextChannelId: activeChannelId,
      actionToken,
      includeBroaderContext: isSlackRetrievalRequest(text) || shouldUseBroaderSlackContext(assistantIntent, text),
      relevantSlackUserIds: activeUserId ? [activeUserId] : [],
      currentSlackUserId: slackUserId,
    });

    if (
      isThreadReply &&
      assistantIntent !== "prep" &&
      assistantIntent !== "practice" &&
      !coachingContext.text
    ) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: "I lost the saved context for this Beckett thread. Send me a link to the Slack message or thread you want to continue from, and I’ll pick it back up.",
        hideTitle: true,
      });

      await slackApiPost(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
      return;
    }

    if (
      isAssistantStarterPrompt(text) &&
      isCompactSlackIntent(assistantIntent) &&
      !coachingContext.text
    ) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: starterPromptMissingContextMessage(assistantIntent),
        hideTitle: true,
      });

      await slackApiPost(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
      return;
    }

    const response = await runSlackCoaching({
      user,
      action: "agent_message",
      prompt: text,
      sourceLabel: "slack_agent_message",
      messageText: coachingContext.text,
      contextStatus: coachingContext.status,
      contextFailureReason: coachingContext.failureReason,
      contextMessageCount: coachingContext.messageCount,
      broaderSearchUsed: coachingContext.broaderSearchUsed,
      relationshipContext: activeRelationship?.promptContext || null,
      intent: assistantIntent,
      responseDetail: responseDetailForSlackIntent(assistantIntent),
    });
    const coachingThread = await createSlackCoachingThread({
      user,
      teamId,
      slackUserId,
      flowType:
        assistantIntent === "respond" ||
        assistantIntent === "rewrite" ||
        assistantIntent === "decode" ||
        assistantIntent === "relationship" ||
        assistantIntent === "prep" ||
        assistantIntent === "practice"
          ? assistantIntent
          : "message",
      title: slackHistoryTitle(
        assistantIntent === "respond" ||
          assistantIntent === "rewrite" ||
          assistantIntent === "decode" ||
          assistantIntent === "relationship" ||
          assistantIntent === "prep" ||
          assistantIntent === "practice"
          ? assistantIntent
          : "message",
        "Messages"
      ),
      promptSnippet: text,
      summary: summarizeSlackCoachingResponse(response, text),
      slackChannelId: channelId,
      threadTs,
      status: "active",
    }).catch((error) => {
      console.error("Slack generic coaching history create failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (coachingThread?.id) {
      await appendSlackCoachingMessage({
        threadId: coachingThread.id,
        user,
        teamId,
        slackUserId,
        role: "user",
        content: text,
      }).catch(() => null);
      await appendSlackCoachingMessage({
        threadId: coachingThread.id,
        user,
        teamId,
        slackUserId,
        role: "beckett",
        content: response,
      }).catch(() => null);
    }
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Communication coach",
      prompt: text,
      body: [
        "Reply in this thread so I can keep this message and follow-ups saved together.",
        "",
        response,
      ].join("\n"),
      actions: [
        ...(isCompactSlackIntent(assistantIntent) ? buildSlackExplainMoreAction(coachingThread?.id) : []),
        ...buildSlackThreadArchiveAction(coachingThread?.id),
      ],
    });

    const postedResponse = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      ...payload,
    });
    if (postedResponse.ok && postedResponse.ts) {
      await recordSlackCoachingBotMessage({
        threadId: coachingThread?.id,
        userId: user.id,
        channelId,
        messageTs: postedResponse.ts,
        kind: "reply",
      }).catch(() => null);
      if (coachingThread?.id) {
        scheduleSlackBackgroundTask(
          "Slack inactivity start card failed",
          scheduleSlackInactivityStartCard({
            botAccessToken: user.botAccessToken,
            threadId: coachingThread.id,
            userId: user.id,
            channelId,
          })
        );
      }
    }

    await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "",
    }).catch(() => null);
  } catch (error) {
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Could not finish that request",
      body: handleSlackAiError(error),
    });
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      ...payload,
    });
  }
}
