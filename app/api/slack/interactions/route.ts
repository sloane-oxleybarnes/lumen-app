import { NextRequest, NextResponse } from "next/server";
import {
  fetchSlackConversationContext,
  formatAskedPrompt,
  formatAskedResponse,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  postSlackResponse,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackConnectText,
  slackMessageResponse,
  SlackBlock,
  SLACK_SLASH_LONGER_ACTION_ID,
  SLACK_SLASH_QUICK_ACTION_ID,
  SlackResponseDetail,
  verifySlackRequest,
} from "@/lib/slack-app";
import { supabaseAdmin } from "@/lib/server-admin";

export const runtime = "nodejs";

type SlackInteractionPayload = {
  type?: string;
  callback_id?: string;
  response_url?: string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; username?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  message?: {
    text?: string;
    user?: string;
    username?: string;
    attachments?: Array<{ text?: string; fallback?: string }>;
  };
  channel?: { id?: string; name?: string };
};

type SlackPendingRequest = {
  id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  prompt: string;
  response_url: string | null;
  expires_at: string;
  completed_at: string | null;
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

function getSlashDetailAction(payload: SlackInteractionPayload) {
  const action = payload.actions?.find((item) =>
    item.action_id === SLACK_SLASH_QUICK_ACTION_ID || item.action_id === SLACK_SLASH_LONGER_ACTION_ID
  );
  if (!action?.value || !action.action_id) return null;
  return {
    requestId: action.value,
    responseDetail: action.action_id === SLACK_SLASH_LONGER_ACTION_ID ? "longer" : "quick",
  } satisfies { requestId: string; responseDetail: SlackResponseDetail };
}

function detailLabel(responseDetail: SlackResponseDetail) {
  return responseDetail === "longer" ? "longer explanation" : "quick answer";
}

function buildPreparingBlocks(prompt: string, responseDetail: SlackResponseDetail): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*You asked:*",
          `>${formatAskedPrompt(prompt)}`,
          "",
          `Beckett is preparing your ${detailLabel(responseDetail)}...`,
        ].join("\n"),
      },
    },
  ];
}

async function replaceSlackInteraction(responseUrl: string, text: string, blocks?: SlackBlock[]) {
  await postSlackResponse(responseUrl, text, {
    replaceOriginal: true,
    blocks,
  });
}

async function loadPendingRequest(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("slack_pending_requests")
    .select(
      "id, user_id, slack_team_id, slack_user_id, slack_channel_id, slack_channel_name, prompt, response_url, expires_at, completed_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  return data as SlackPendingRequest | null;
}

async function claimPendingRequest({
  requestId,
  teamId,
  slackUserId,
}: {
  requestId: string;
  teamId: string;
  slackUserId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("slack_pending_requests")
    .update({ completed_at: now })
    .eq("id", requestId)
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .is("completed_at", null)
    .gt("expires_at", now)
    .select(
      "id, user_id, slack_team_id, slack_user_id, slack_channel_id, slack_channel_name, prompt, response_url, expires_at, completed_at"
    )
    .maybeSingle();

  if (error) throw error;
  if (data) return { pending: data as SlackPendingRequest, message: null };

  const existing = await loadPendingRequest(requestId);
  if (!existing) {
    return { pending: null, message: "That Beckett request is no longer available. Please run `/beckett` again." };
  }
  if (existing.slack_team_id !== teamId || existing.slack_user_id !== slackUserId) {
    return { pending: null, message: "That Beckett request belongs to another Slack user." };
  }
  if (existing.completed_at) {
    return { pending: null, message: "I already answered that Beckett request. Run `/beckett` again for a new one." };
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    return { pending: null, message: "That Beckett request expired. Please run `/beckett` again." };
  }
  return { pending: null, message: "I could not open that Beckett request. Please run `/beckett` again." };
}

async function sendPendingSlashResponse({
  origin,
  payload,
  requestId,
  responseDetail,
}: {
  origin: string;
  payload: SlackInteractionPayload;
  requestId: string;
  responseDetail: SlackResponseDetail;
}) {
  const teamId = payload.team?.id || "";
  const slackUserId = payload.user?.id || "";
  const initialResponseUrl = payload.response_url || "";

  try {
    if (!teamId || !slackUserId) {
      await replaceSlackInteraction(initialResponseUrl, "Beckett could not read the Slack workspace and user context.");
      return;
    }

    const claim = await claimPendingRequest({ requestId, teamId, slackUserId });
    if (!claim.pending) {
      await replaceSlackInteraction(initialResponseUrl, claim.message || "Please run `/beckett` again.");
      return;
    }

    const pending = claim.pending;
    const responseUrl = initialResponseUrl || pending.response_url || "";
    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    if (!user) {
      await replaceSlackInteraction(responseUrl, slackConnectText(origin));
      return;
    }

    if (!isAllowedSlackPlan(user)) {
      await replaceSlackInteraction(responseUrl, "Beckett Slack coaching is available for beta and pro users.");
      return;
    }

    const channelContext = await fetchSlackConversationContext({
      accessToken: user.accessToken,
      channelId: pending.slack_channel_id,
      channelName: pending.slack_channel_name,
    });
    const response = await runSlackCoaching({
      user,
      action: "slash_command",
      prompt: pending.prompt,
      sourceLabel: `/beckett:${responseDetail}`,
      messageText: channelContext,
      responseDetail,
    });

    await replaceSlackInteraction(responseUrl, formatAskedResponse(pending.prompt, response));
  } catch (error) {
    await replaceSlackInteraction(
      initialResponseUrl,
      `Beckett could not finish that request: ${handleSlackAiError(error)}`
    );
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseInteractionPayload(rawBody);
  if (!payload) return NextResponse.json({ error: "Invalid Slack payload." }, { status: 400 });

  if (payload.type === "block_actions") {
    const detailAction = getSlashDetailAction(payload);
    if (!detailAction) return NextResponse.json({ ok: true });

    const existing = await loadPendingRequest(detailAction.requestId);
    if (!existing) {
      if (payload.response_url) {
        await replaceSlackInteraction(
          payload.response_url,
          "That Beckett request is no longer available. Please run `/beckett` again."
        );
        return NextResponse.json({ ok: true });
      }
      return slackMessageResponse("That Beckett request is no longer available. Please run `/beckett` again.", {
        replaceOriginal: true,
      });
    }

    const responseUrl = payload.response_url || existing.response_url || "";
    if (responseUrl) {
      await replaceSlackInteraction(
        responseUrl,
        `Beckett is preparing your ${detailLabel(detailAction.responseDetail)}...`,
        buildPreparingBlocks(existing.prompt, detailAction.responseDetail)
      );
    } else {
      return slackMessageResponse(`Beckett is preparing your ${detailLabel(detailAction.responseDetail)}...`, {
        replaceOriginal: true,
        blocks: buildPreparingBlocks(existing.prompt, detailAction.responseDetail),
      });
    }

    scheduleSlackBackgroundTask(
      "Slack slash choice response failed",
      sendPendingSlashResponse({
        origin: req.nextUrl.origin,
        payload,
        requestId: detailAction.requestId,
        responseDetail: detailAction.responseDetail,
      })
    );

    return NextResponse.json({ ok: true });
  }

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
