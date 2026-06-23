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
  SlackCoachingIntent,
  slackAskedLabel,
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

type ParsedSlackCommand = {
  intent: SlackCoachingIntent;
  prompt: string;
  missingText?: string;
};

const slashSubcommands: Record<
  string,
  { intent: Exclude<SlackCoachingIntent, "general">; missingText: string }
> = {
  rewrite: {
    intent: "rewrite",
    missingText: 'Add the draft message after `/beckett rewrite`, like `/beckett rewrite "Any update on this?"`.',
  },
  decode: {
    intent: "decode",
    missingText: 'Add the message you want Beckett to decode, like `/beckett decode "Sure, sounds fine."`.',
  },
  draft: {
    intent: "draft",
    missingText: "Add what you need to say after `/beckett draft`, like `/beckett draft ask my manager for clearer priorities this week`.",
  },
  prep: {
    intent: "prep",
    missingText: "Add the conversation you want to prepare for after `/beckett prep`.",
  },
  tone: {
    intent: "tone",
    missingText: 'Add the wording you want Beckett to check, like `/beckett tone "I need this by Friday."`.',
  },
  followup: {
    intent: "followup",
    missingText: "Add the follow-up you need after `/beckett followup`.",
  },
  "follow-up": {
    intent: "followup",
    missingText: "Add the follow-up you need after `/beckett follow-up`.",
  },
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

function parseBeckettText(rawText: string): ParsedSlackCommand {
  const text = rawText.trim();
  const match = text.match(/^([a-z][a-z-]*):?\s*([\s\S]*)$/i);
  const command = match?.[1]?.toLowerCase();
  const definition = command ? slashSubcommands[command] : null;

  if (!definition) return { intent: "general", prompt: text };

  const prompt = (match?.[2] || "").trim();
  return {
    intent: definition.intent,
    prompt,
    missingText: prompt ? undefined : definition.missingText,
  };
}

function buildButtonValue(requestId: string, intent: SlackCoachingIntent) {
  return JSON.stringify({ requestId, intent });
}

function helpText(command = "/beckett") {
  return [
    "*Beckett is ready in Slack.*",
    "",
    `Try \`${command} rewrite "Any update on this?"\``,
    `Try \`${command} decode "Sure, sounds fine."\``,
    `Try \`${command} draft ask my manager for clearer priorities this week\``,
    `Try \`${command} prep I need to tell a teammate their handoffs are too vague\``,
    `Try \`${command} tone "I need this by Friday."\``,
    `Try \`${command} followup remind Avery about the readout\``,
    "",
    "For help with a specific Slack message, use the message shortcut: *Ask Beckett about this message*.",
  ].join("\n");
}

function buildChoiceBlocks(prompt: string, requestId: string, intent: SlackCoachingIntent): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [`*${slackAskedLabel(intent)}*`, `>${formatAskedPrompt(prompt)}`, "", "*How much help do you want?*"].join(
          "\n"
        ),
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
          value: buildButtonValue(requestId, intent),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Longer explanation",
          },
          action_id: SLACK_SLASH_LONGER_ACTION_ID,
          value: buildButtonValue(requestId, intent),
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

  const parsed = parseBeckettText(text);
  if (parsed.missingText) return slackTextResponse(parsed.missingText);

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
    prompt: parsed.prompt,
    response_url: payload.response_url,
    expires_at: expiresAt,
  });

  if (error) {
    return slackErrorResponse("I could not save this Slack request. Please try /beckett again.");
  }

  return slackMessageResponse(`${slackAskedLabel(parsed.intent)} ${parsed.prompt}\n\nHow much help do you want?`, {
    blocks: buildChoiceBlocks(parsed.prompt, requestId, parsed.intent),
  });
}
