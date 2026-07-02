import { NextRequest, NextResponse } from "next/server";
import {
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackApiPost,
  verifySlackRequest,
} from "@/lib/slack-app";

export const runtime = "nodejs";

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    channel_type?: string;
    channel?: string;
    user?: string;
    bot_id?: string;
    subtype?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
  };
};

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
    })
  );

  return NextResponse.json({ ok: true });
}

async function respondToAgentMessage({
  teamId,
  slackUserId,
  channelId,
  threadTs,
  text,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
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

    const response = await runSlackCoaching({
      user,
      action: "agent_message",
      prompt: text,
      sourceLabel: "slack_agent_message",
      intent: "general",
      responseDetail: "longer",
    });

    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      text: response,
    });

    await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "",
    }).catch(() => null);
  } catch (error) {
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      text: `Beckett could not finish that request: ${handleSlackAiError(error)}`,
    });
  }
}
