import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedSlackPlan,
  formatAskedPrompt,
  lookupSlackConnectedUser,
  slackMessageResponse,
  slackConnectText,
  slackErrorResponse,
  SlackBlock,
  SLACK_SLASH_LONGER_ACTION_ID,
  SLACK_SLASH_QUICK_ACTION_ID,
  slackTextResponse,
  verifySlackRequest,
} from "@/lib/slack-app";
import { supabaseAdmin } from "@/lib/server-admin";

export const runtime = "nodejs";

type SlashCommandPayload = {
  team_id?: string;
  user_id?: string;
  channel_id?: string;
  channel_name?: string;
  text?: string;
  command?: string;
  response_url?: string;
  ssl_check?: string;
};

function parseSlashCommand(rawBody: string): SlashCommandPayload {
  const params = new URLSearchParams(rawBody);
  return {
    team_id: params.get("team_id") || undefined,
    user_id: params.get("user_id") || undefined,
    channel_id: params.get("channel_id") || undefined,
    channel_name: params.get("channel_name") || undefined,
    text: params.get("text") || "",
    command: params.get("command") || undefined,
    response_url: params.get("response_url") || undefined,
    ssl_check: params.get("ssl_check") || undefined,
  };
}

function helpText(command = "/beckett") {
  return [
    "*Beckett is ready in Slack.*",
    "",
    `Try \`${command} is this too direct? "I need this by Friday."\``,
    `Try \`${command} help me rewrite: "Any update on this?"\``,
    "",
    "For help with a specific Slack message, use the message shortcut: *Ask Beckett about this message*.",
  ].join("\n");
}

function buildChoiceBlocks(prompt: string, requestId: string): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [`*You asked:*`, `>${formatAskedPrompt(prompt)}`, "", "*How much help do you want?*"].join("\n"),
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Quick answer",
          },
          style: "primary",
          action_id: SLACK_SLASH_QUICK_ACTION_ID,
          value: requestId,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Longer explanation",
          },
          action_id: SLACK_SLASH_LONGER_ACTION_ID,
          value: requestId,
        },
      ],
    },
  ];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseSlashCommand(rawBody);
  if (payload.ssl_check === "1") return NextResponse.json({ ok: true });

  const text = payload.text?.trim() || "";
  if (!payload.team_id || !payload.user_id) {
    return slackErrorResponse("Slack did not include the workspace and user context.");
  }

  if (!text) return slackTextResponse(helpText(payload.command));

  if (!payload.response_url) {
    return slackErrorResponse("Slack did not include a response URL for this command.");
  }

  const user = await lookupSlackConnectedUser(payload.team_id, payload.user_id);
  if (!user) return slackTextResponse(slackConnectText(req.nextUrl.origin));
  if (!isAllowedSlackPlan(user)) {
    return slackTextResponse("Beckett Slack coaching is available for beta and pro users.");
  }

  const requestId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("slack_pending_requests").insert({
    id: requestId,
    user_id: user.id,
    slack_team_id: payload.team_id,
    slack_user_id: payload.user_id,
    slack_channel_id: payload.channel_id || null,
    slack_channel_name: payload.channel_name || null,
    prompt: text,
    response_url: payload.response_url,
    expires_at: expiresAt,
  });

  if (error) {
    return slackErrorResponse("I could not save this Slack request. Please try /beckett again.");
  }

  return slackMessageResponse(`You asked: ${text}\n\nHow much help do you want?`, {
    blocks: buildChoiceBlocks(text, requestId),
  });
}
