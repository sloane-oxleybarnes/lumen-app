import { NextRequest, NextResponse } from "next/server";
import {
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  postSlackResponse,
  runSlackCoaching,
  slackConnectText,
  verifySlackRequest,
} from "@/lib/slack-app";

export const runtime = "nodejs";

type SlackInteractionPayload = {
  type?: string;
  callback_id?: string;
  response_url?: string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; username?: string };
  message?: {
    text?: string;
    user?: string;
    username?: string;
    attachments?: Array<{ text?: string; fallback?: string }>;
  };
  channel?: { id?: string; name?: string };
};

function parseInteractionPayload(rawBody: string): SlackInteractionPayload | null {
  const params = new URLSearchParams(rawBody);
  const payload = params.get("payload");
  if (!payload) return null;
  try {
    return JSON.parse(payload) as SlackInteractionPayload;
  } catch {
    return null;
  }
}

function buildShortcutPrompt(payload: SlackInteractionPayload) {
  const channel = payload.channel?.name ? `#${payload.channel.name}` : "this Slack conversation";
  const author = payload.message?.username || payload.message?.user || "the other person";
  return [
    `Help me understand this message from ${author} in ${channel}.`,
    "What might be happening underneath it, what should I pay attention to, and what could I say next?",
  ].join(" ");
}

function extractMessageText(payload: SlackInteractionPayload) {
  const mainText = payload.message?.text?.trim();
  if (mainText) return mainText;

  const attachmentText = payload.message?.attachments
    ?.map((attachment) => attachment.text || attachment.fallback || "")
    .join("\n")
    .trim();

  return attachmentText || "";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseInteractionPayload(rawBody);
  if (!payload) return NextResponse.json({ error: "Invalid Slack payload." }, { status: 400 });

  if (payload.type !== "message_action" || payload.callback_id !== "beckett_message_context") {
    return NextResponse.json({ ok: true });
  }

  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const responseUrl = payload.response_url || "";
  const messageText = extractMessageText(payload);

  if (!teamId || !slackUserId) {
    await postSlackResponse(responseUrl, "Beckett could not read the Slack workspace and user context.");
    return NextResponse.json({ ok: true });
  }

  if (!messageText) {
    await postSlackResponse(responseUrl, "Beckett could not read message text from that Slack shortcut.");
    return NextResponse.json({ ok: true });
  }

  try {
    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    if (!user) {
      await postSlackResponse(responseUrl, slackConnectText(req.nextUrl.origin));
      return NextResponse.json({ ok: true });
    }

    if (!isAllowedSlackPlan(user)) {
      await postSlackResponse(responseUrl, "Beckett Slack coaching is available for beta and pro users.");
      return NextResponse.json({ ok: true });
    }

    const response = await runSlackCoaching({
      user,
      action: "message_shortcut",
      prompt: buildShortcutPrompt(payload),
      sourceLabel: "slack_message_shortcut",
      messageText,
    });

    await postSlackResponse(responseUrl, response);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await postSlackResponse(responseUrl, `Beckett could not finish that request: ${handleSlackAiError(error)}`);
    return NextResponse.json({ ok: true });
  }
}
