import { NextRequest, NextResponse } from "next/server";
import {
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  runSlackCoaching,
  slackConnectResponse,
  slackErrorResponse,
  slackTextResponse,
  verifySlackRequest,
} from "@/lib/slack-app";

export const runtime = "nodejs";

type SlashCommandPayload = {
  team_id?: string;
  user_id?: string;
  text?: string;
  command?: string;
  ssl_check?: string;
};

function parseSlashCommand(rawBody: string): SlashCommandPayload {
  const params = new URLSearchParams(rawBody);
  return {
    team_id: params.get("team_id") || undefined,
    user_id: params.get("user_id") || undefined,
    text: params.get("text") || "",
    command: params.get("command") || undefined,
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

  try {
    const user = await lookupSlackConnectedUser(payload.team_id, payload.user_id);
    if (!user) return slackConnectResponse(req.nextUrl.origin);
    if (!isAllowedSlackPlan(user)) {
      return slackTextResponse("Beckett Slack coaching is available for beta and pro users.");
    }

    const response = await runSlackCoaching({
      user,
      action: "slash_command",
      prompt: text,
      sourceLabel: payload.command || "/beckett",
    });

    return slackTextResponse(response);
  } catch (error) {
    return slackErrorResponse(handleSlackAiError(error));
  }
}
