import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  configureSlackAgentSurface,
  fetchSlackConversationContext,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  lookupSlackWorkspaceBotToken,
  resolveSlackAuthorRelationshipContext,
  runSlackGuestCoaching,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackApiPost,
  type SlackCoachingIntent,
  verifySlackRequest,
} from "@/lib/slack-app";
import { handleGuidedSlackPrep } from "@/lib/slack-guided-prep";
import {
  appendSlackCoachingMessage,
  buildSlackThreadArchiveAction,
  createSlackCoachingThread,
  findSlackCoachingThreadBySlackThread,
  formatSlackCoachingMessages,
  loadSlackCoachingMessages,
  publishSlackConnectHome,
  publishSlackHomeResult,
  recordSlackCoachingBotMessage,
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
    "help me draft a clear response to the current conversation.",
    "help me rewrite my response so it is clearer and kinder.",
    "help me prepare for a difficult conversation.",
  ].includes(normalized);
}

function guestModeFooter() {
  return "Connect Slack in Beckett Settings to use your coaching profile, contact context, broader Slack history, and saved Beckett conversations.";
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
    limit: 10,
  }).catch(() => []);
  const transcript = formatSlackCoachingMessages(previousMessages, 1800);
  const prompt = [
    `The user is continuing this Beckett coaching thread: ${thread.title}.`,
    thread.summary ? `Current summary: ${thread.summary}` : "",
    transcript ? `Previous Beckett conversation:\n${transcript}` : "",
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

  const response = await runSlackCoaching({
    user,
    action: "agent_message",
    prompt,
    sourceLabel: thread.title,
    messageText: transcript || thread.summary || thread.prompt_snippet || text,
    contextStatus: "available",
    contextMessageCount: previousMessages.length,
    broaderSearchUsed: false,
    intent,
    responseDetail: "longer",
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
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  activeUserId?: string | null;
  actionToken?: string | null;
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
      if (intent === "prep" || intent === "practice") {
        const payload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          body: [
            "Prep and practice use your Beckett profile and saved coaching setup.",
            "",
            "Connect Slack from Beckett Settings, then come back here to use that flow.",
          ].join("\n"),
          footer: "You can still paste a message here for lightweight decode, respond, or rewrite help.",
          hideTitle: true,
        });

        await slackApiPost(botAccessToken, "chat.postMessage", {
          channel: channelId,
          thread_ts: threadTs,
          ...payload,
        });
        return;
      }

      try {
        const messageText = isAssistantStarterPrompt(text) ? "" : text;
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
          footer: guestModeFooter(),
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
    });

    if (
      isAssistantStarterPrompt(text) &&
      (assistantIntent === "decode" || assistantIntent === "respond" || assistantIntent === "rewrite") &&
      !coachingContext.text
    ) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: [
          "I can help, but I could not read a current Slack message from here.",
          "",
          "Paste or paraphrase the message you want help with, or use Ask Beckett from the message’s menu.",
        ].join("\n"),
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
      responseDetail: "longer",
    });
    const coachingThread = await createSlackCoachingThread({
      user,
      teamId,
      slackUserId,
      flowType:
        assistantIntent === "respond" ||
        assistantIntent === "rewrite" ||
        assistantIntent === "decode" ||
        assistantIntent === "prep" ||
        assistantIntent === "practice"
          ? assistantIntent
          : "message",
      title: slackHistoryTitle(
        assistantIntent === "respond" ||
          assistantIntent === "rewrite" ||
          assistantIntent === "decode" ||
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
      body: response,
      footer: [
        coachingContext.broaderSearchUsed ? "Used relevant Slack history for context." : "",
        relationshipNote,
      ].filter(Boolean).join("\n") || undefined,
      actions: buildSlackThreadArchiveAction(coachingThread?.id),
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
