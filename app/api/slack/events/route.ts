import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  buildGuestSlackContextPacket,
  buildSlackCoachingContext,
  configureSlackAgentSurface,
  fetchSlackConversationContext,
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
import { handleGuidedSlackPrep } from "@/lib/slack-guided-prep";
import {
  appendSlackCoachingMessage,
  buildSlackExplainMoreAction,
  buildSlackThreadArchiveAction,
  createSlackCoachingThread,
  findSlackCoachingThreadBySlackThread,
  formatSlackCoachingMessages,
  loadSlackCoachingMessages,
  publishSlackConnectHome,
  publishSlackHomeResult,
  recordSlackCoachingBotMessage,
  scheduleSlackInactivityStartCard,
  slackHistoryTitle,
  summarizeSlackCoachingResponse,
  updateSlackCoachingThread,
} from "@/lib/slack-history";

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

function isAssistantStarterPrompt(text: string) {
  const normalized = text.trim().toLowerCase();
  return [
    "help me decode the current message without over-reading it.",
    "show me how to decode a specific slack message with beckett.",
    "help me draft a clear response to the current conversation.",
    "show me how to draft a response from a specific slack message with beckett.",
    "help me rewrite my response so it is clearer and kinder.",
    "help me rewrite this draft so it is clearer and kinder.",
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
      const intent = assistantIntent;
      try {
        const linkedSlackContext = extractSlackPermalinkContext(text);
        const guestContext = await buildGuestSlackContextPacket({
          botAccessToken,
          channelId: linkedSlackContext?.channelId || activeChannelId || channelId,
          selectedMessageTs: linkedSlackContext?.messageTs,
          threadTs: linkedSlackContext?.threadTs,
          selectedMessageText: isAssistantStarterPrompt(text) ? "" : text,
          userRequest: text,
          currentSlackUserId: slackUserId,
        });
        const messageText = isAssistantStarterPrompt(text) ? guestContext.text : guestContext.text || text;
        const response = await runSlackGuestCoaching({
          teamId,
          slackUserId,
          action: "agent_message",
          prompt: text,
          messageText,
          intent,
        });
        const payload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          prompt: isAssistantStarterPrompt(text) ? undefined : text,
          body: response,
          footer: "Guest mode is on for hackathon judging. Connect Slack in Beckett Settings for profile, contact context, broader Slack history, and saved conversations.",
          hideTitle: true,
        });

        await slackApiPost(botAccessToken, "chat.postMessage", {
          channel: channelId,
          thread_ts: threadTs,
          ...payload,
        });
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
    const relationshipNote =
      activeRelationship && !activeRelationship.linked && activeRelationship.slackIdentifier
        ? `Add confirmed Slack ID ${activeRelationship.slackIdentifier} to this person's Beckett contact to use relationship context next time.`
        : "";

    if (
      isAssistantStarterPrompt(text) &&
      (assistantIntent === "decode" || assistantIntent === "respond")
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
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: continuedThread.response,
        hideTitle: true,
      });

      const postedContinuation = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      if (postedContinuation.ok && postedContinuation.ts) {
        await recordSlackCoachingBotMessage({
          threadId: continuedThread.thread.id,
          userId: user.id,
          channelId,
          messageTs: postedContinuation.ts,
          kind: "reply",
        }).catch(() => null);
        scheduleSlackBackgroundTask(
          "Slack inactivity start card failed",
          scheduleSlackInactivityStartCard({
            botAccessToken: user.botAccessToken,
            threadId: continuedThread.thread.id,
            userId: user.id,
            channelId,
          })
        );
      }
      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
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
      includeBroaderContext: shouldUseBroaderSlackContext(assistantIntent, text),
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
      footer: relationshipNote || undefined,
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
