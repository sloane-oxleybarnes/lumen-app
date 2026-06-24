import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_SLACK_TEXT_LENGTH = 2800;
const MAX_SLACK_ASKED_PROMPT_LENGTH = 650;
const SLACK_SLASH_QUICK_ACTION_ID = "beckett_slash_quick";
const SLACK_SLASH_LONGER_ACTION_ID = "beckett_slash_longer";

type SlackCoachingIntent = "general" | "rewrite" | "decode" | "draft" | "prep" | "tone" | "followup";
type SlackBlock = Record<string, unknown>;
type SlackMessageOptions = {
  blocks?: SlackBlock[];
  replaceOriginal?: boolean;
  responseType?: "ephemeral" | "in_channel";
};
type SlackVerificationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };
type VercelRequestContext = {
  get?: () =>
    | {
        waitUntil?: (task: Promise<unknown>) => void;
      }
    | undefined;
};

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

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function verifySlackRequest(req: NextRequest, rawBody: string): SlackVerificationResult {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return { ok: false, status: 500, message: "Slack signing secret is not configured." };
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const timestampNumber = Number(timestamp);

  if (!timestamp || !signature || !Number.isFinite(timestampNumber)) {
    return { ok: false, status: 401, message: "Missing Slack signature." };
  }

  const ageInSeconds = Math.abs(Date.now() / 1000 - timestampNumber);
  if (ageInSeconds > 60 * 5) {
    return { ok: false, status: 401, message: "Slack request is too old." };
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  if (!safeCompare(signature, expectedSignature)) {
    return { ok: false, status: 401, message: "Invalid Slack signature." };
  }

  return { ok: true };
}

function truncateSlackText(text: string, maxLength = MAX_SLACK_TEXT_LENGTH) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 24).trim()}\n\n_Response shortened._`;
}

function buildSlackMessagePayload(text: string, options: SlackMessageOptions = {}) {
  return {
    response_type: options.responseType || "ephemeral",
    replace_original: options.replaceOriginal || false,
    text: truncateSlackText(text),
    blocks:
      options.blocks ||
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: truncateSlackText(text),
          },
        },
      ],
  };
}

function slackMessageResponse(text: string, options: SlackMessageOptions & { status?: number } = {}) {
  return NextResponse.json(buildSlackMessagePayload(text, options), { status: options.status || 200 });
}

function slackTextResponse(text: string, status = 200) {
  return slackMessageResponse(text, { status });
}

function slackErrorResponse(message: string, status = 200) {
  return slackTextResponse(`Beckett could not finish that request: ${message}`, status);
}

async function postSlackResponse(responseUrl: string, text: string, options: SlackMessageOptions = {}) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSlackMessagePayload(text, options)),
  });
}

function scheduleSlackBackgroundTask(label: string, task: Promise<void>) {
  const handledTask = task.catch((error) => {
    console.error(label, error);
  });
  const requestContext = (globalThis as { [key: symbol]: VercelRequestContext | undefined })[
    Symbol.for("@vercel/request-context")
  ];
  const context = requestContext?.get?.();
  if (context?.waitUntil) {
    context.waitUntil(handledTask);
  } else {
    void handledTask;
  }
}

function escapeSlackMrkdwn(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatAskedPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const truncated =
    normalized.length <= MAX_SLACK_ASKED_PROMPT_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_SLACK_ASKED_PROMPT_LENGTH - 12).trim()}...`;
  return escapeSlackMrkdwn(truncated);
}

function slackAskedLabel(intent: SlackCoachingIntent = "general") {
  switch (intent) {
    case "rewrite":
      return "You asked Beckett to rewrite:";
    case "decode":
      return "You asked Beckett to decode:";
    case "draft":
      return "You asked Beckett to draft:";
    case "prep":
      return "You asked Beckett to help you prep:";
    case "tone":
      return "You asked Beckett to check tone:";
    case "followup":
      return "You asked Beckett to follow up:";
    default:
      return "You asked:";
  }
}

function slackConnectText(origin: string) {
  return [
    "I could not match this Slack account to a Beckett beta profile yet.",
    "",
    `Connect Slack from Beckett Settings, then try again: <${origin}/dashboard/settings|Open Beckett Settings>`,
  ].join("\n");
}

async function lookupSlackConnectedUser(
  supabaseAdmin: typeof import("@/lib/server-admin")["supabaseAdmin"],
  teamId: string,
  slackUserId: string
) {
  const { data: integration, error } = await supabaseAdmin
    .from("user_integrations")
    .select("user_id")
    .eq("provider", "slack")
    .eq("external_team_id", teamId)
    .eq("external_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  if (!integration?.user_id) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, plan")
    .eq("id", integration.user_id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  return {
    id: profile.id as string,
    plan: (profile.plan as string | null) || "free",
  };
}

function isAllowedSlackPlan(user: { plan: string | null }) {
  return user.plan === "beta" || user.plan === "pro";
}

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

async function sendSlashChoiceCard({
  origin,
  payload,
  parsed,
}: {
  origin: string;
  payload: SlashCommandPayload;
  parsed: ParsedSlackCommand;
}) {
  const responseUrl = payload.response_url || "";
  const logContext = {
    teamPresent: Boolean(payload.team_id),
    userPresent: Boolean(payload.user_id),
    channelPresent: Boolean(payload.channel_id),
    intent: parsed.intent,
    promptLength: parsed.prompt.length,
  };

  try {
    console.info("Slack command setup started", logContext);
    const { supabaseAdmin } = await import("@/lib/server-admin");

    if (!payload.team_id || !payload.user_id) {
      await postSlackResponse(responseUrl, "Beckett could not read the Slack workspace and user context.", {
        replaceOriginal: true,
      });
      return;
    }

    const user = await lookupSlackConnectedUser(supabaseAdmin, payload.team_id, payload.user_id);
    console.info("Slack command user lookup complete", {
      ...logContext,
      connected: Boolean(user),
    });

    if (!user) {
      await postSlackResponse(responseUrl, slackConnectText(origin), { replaceOriginal: true });
      return;
    }

    if (!isAllowedSlackPlan(user)) {
      await postSlackResponse(responseUrl, "Beckett Slack coaching is available for beta and pro users.", {
        replaceOriginal: true,
      });
      return;
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
      response_url: responseUrl,
      expires_at: expiresAt,
    });

    if (error) {
      console.error("Slack command pending insert failed", {
        ...logContext,
        code: error.code,
        message: error.message,
      });
      await postSlackResponse(responseUrl, "Beckett could not save this Slack request. Please try `/beckett` again.", {
        replaceOriginal: true,
      });
      return;
    }

    console.info("Slack command pending request inserted", {
      ...logContext,
      requestId,
    });

    await postSlackResponse(
      responseUrl,
      `${slackAskedLabel(parsed.intent)} ${parsed.prompt}\n\nHow much help do you want?`,
      {
        replaceOriginal: true,
        blocks: buildChoiceBlocks(parsed.prompt, requestId, parsed.intent),
      }
    );
    console.info("Slack command choice card posted", {
      ...logContext,
      requestId,
    });
  } catch (error) {
    console.error("Slack command setup failed", {
      ...logContext,
      message: error instanceof Error ? error.message : String(error),
    });
    await postSlackResponse(responseUrl, "Beckett could not open that request. Please try `/beckett` again.", {
      replaceOriginal: true,
    });
  }
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

  console.info("Slack command received", {
    teamPresent: Boolean(payload.team_id),
    userPresent: Boolean(payload.user_id),
    channelPresent: Boolean(payload.channel_id),
    intent: parsed.intent,
    promptLength: parsed.prompt.length,
  });

  scheduleSlackBackgroundTask(
    "Slack command setup background task failed",
    sendSlashChoiceCard({
      origin: req.nextUrl.origin,
      payload,
      parsed,
    })
  );

  return slackTextResponse("Beckett is opening your request...");
}
