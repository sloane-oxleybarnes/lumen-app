import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  configureSlackAgentSurface,
  fetchSlackConversationContext,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackApiPost,
  verifySlackRequest,
} from "@/lib/slack-app";
import { handleGuidedSlackPrep } from "@/lib/slack-guided-prep";

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
  return {
    channelId: channelEntity?.value || null,
    actionToken: event.action_token || null,
  };
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
    event.user &&
    (!event.tab || event.tab === "messages")
  ) {
    scheduleSlackBackgroundTask(
      "Slack agent surface setup failed",
      setupAgentSurface({
        teamId: body.team_id || "",
        slackUserId: event.user,
        channelId: event.channel,
      })
    );
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

  scheduleSlackBackgroundTask(
    "Slack agent message response failed",
    respondToAgentMessage({
      teamId: body.team_id || "",
      slackUserId: event.user,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts || "",
      text: event.text,
      activeChannelId: extractActiveSlackContext(event).channelId,
      actionToken: extractActiveSlackContext(event).actionToken,
    })
  );

  return NextResponse.json({ ok: true });
}

async function setupAgentSurface({
  teamId,
  slackUserId,
  channelId,
}: {
  teamId: string;
  slackUserId: string;
  channelId?: string;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken || !isAllowedSlackPlan(user)) return;

  await configureSlackAgentSurface({
    botAccessToken: user.botAccessToken,
    slackUserId,
    channelId,
  });
}

async function respondToAgentMessage({
  teamId,
  slackUserId,
  channelId,
  threadTs,
  text,
  activeChannelId,
  actionToken,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  actionToken?: string | null;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken) return;

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

    const guidedPrep = await handleGuidedSlackPrep({
      user,
      teamId,
      slackUserId,
      channelId,
      threadTs,
      text,
      activeChannelId,
      actionToken,
    });

    if (guidedPrep.handled) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "Guided prep",
        body: guidedPrep.response,
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

    const coachingContext = await buildSlackCoachingContext({
      user,
      prompt: text,
      activeContext,
      contextChannelId: activeChannelId,
      actionToken,
    });

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
      intent: "general",
      responseDetail: "longer",
    });
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Communication coach",
      prompt: text,
      body: response,
      footer: coachingContext.broaderSearchUsed ? "Used relevant Slack history for context." : undefined,
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
