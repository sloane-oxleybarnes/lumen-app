import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { trackBetaEvent } from "@/lib/beta-events";
import { getPublicSiteUrl } from "@/lib/deployment-env";
import { supabaseAdmin } from "@/lib/server-admin";

const MAX_SLACK_TEXT_LENGTH = 2900;
const MAX_SLACK_CONTEXT_MESSAGES = 8;
const MAX_SLACK_CONTEXT_LENGTH = 2600;
const MAX_SLACK_ASKED_PROMPT_LENGTH = 650;
export const SLACK_SLASH_QUICK_ACTION_ID = "beckett_slash_quick";
export const SLACK_SLASH_LONGER_ACTION_ID = "beckett_slash_longer";

export type SlackResponseDetail = "quick" | "longer";
export type SlackBlock = Record<string, unknown>;

type SlackMessageOptions = {
  blocks?: SlackBlock[];
  replaceOriginal?: boolean;
  responseType?: "ephemeral" | "in_channel";
};

export type SlackConnectedUser = {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  accessToken: string | null;
  teamName: string | null;
  communicationPreferences: string[];
  coachingTone: string | null;
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

type SlackHistoryMessage = {
  type?: string;
  user?: string;
  username?: string;
  bot_id?: string;
  text?: string;
  subtype?: string;
  ts?: string;
};

type SlackUserInfo = {
  ok?: boolean;
  user?: {
    id?: string;
    name?: string;
    real_name?: string;
    profile?: {
      display_name?: string;
      real_name?: string;
    };
  };
};

const slackUserNameCache = new Map<string, string>();

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

export function verifySlackRequest(req: NextRequest, rawBody: string): SlackVerificationResult {
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

export function slackMessageResponse(text: string, options: SlackMessageOptions & { status?: number } = {}) {
  return NextResponse.json(buildSlackMessagePayload(text, options), { status: options.status || 200 });
}

export function slackTextResponse(text: string, status = 200) {
  return slackMessageResponse(text, { status });
}

export function slackErrorResponse(message: string, status = 200) {
  return slackTextResponse(`Beckett could not finish that request: ${message}`, status);
}

export function slackConnectText(origin: string, detail?: string) {
  const settingsUrl = `${getPublicSiteUrl(origin)}/dashboard/settings`;
  return [
    detail || "I could not match this Slack account to a Beckett beta profile yet.",
    "",
    `Connect Slack from Beckett Settings, then try again: <${settingsUrl}|Open Beckett Settings>`,
  ].join("\n");
}

export function slackConnectResponse(origin: string, detail?: string) {
  return slackTextResponse(slackConnectText(origin, detail));
}

export async function postSlackResponse(responseUrl: string, text: string, options: SlackMessageOptions = {}) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSlackMessagePayload(text, options)),
  });
}

export function scheduleSlackBackgroundTask(label: string, task: Promise<void>) {
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

export function escapeSlackMrkdwn(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatAskedPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const truncated =
    normalized.length <= MAX_SLACK_ASKED_PROMPT_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_SLACK_ASKED_PROMPT_LENGTH - 12).trim()}...`;
  return escapeSlackMrkdwn(truncated);
}

export function formatAskedResponse(prompt: string, response: string) {
  return [`*You asked:*`, `>${formatAskedPrompt(prompt)}`, "", response].join("\n");
}

export async function lookupSlackConnectedUser(teamId: string, slackUserId: string) {
  const { data: integration, error } = await supabaseAdmin
    .from("user_integrations")
    .select("user_id, access_token, external_team_name")
    .eq("provider", "slack")
    .eq("external_team_id", teamId)
    .eq("external_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  if (!integration?.user_id) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, display_name, first_name, full_name, plan, communication_preferences, coaching_tone")
    .eq("id", integration.user_id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email || null,
    name: profile.display_name || profile.first_name || profile.full_name || null,
    plan: profile.plan || "free",
    accessToken: integration.access_token || null,
    teamName: integration.external_team_name || null,
    communicationPreferences: Array.isArray(profile.communication_preferences)
      ? profile.communication_preferences
      : [],
    coachingTone: profile.coaching_tone || null,
  } satisfies SlackConnectedUser;
}

export function isAllowedSlackPlan(user: SlackConnectedUser) {
  return user.plan === "beta" || user.plan === "pro";
}

function stripSlackMarkup(text: string) {
  return text
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function slackApiFetch<T>(accessToken: string, method: string, params: URLSearchParams) {
  const res = await fetch(`https://slack.com/api/${method}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json().catch(() => ({})) as Promise<T & { ok?: boolean; error?: string }>;
}

async function lookupSlackUserName(accessToken: string, userId: string) {
  const cacheKey = `${accessToken.slice(-8)}:${userId}`;
  const cached = slackUserNameCache.get(cacheKey);
  if (cached) return cached;

  const data = await slackApiFetch<SlackUserInfo>(
    accessToken,
    "users.info",
    new URLSearchParams({ user: userId })
  ).catch(() => null);
  const name =
    data?.user?.profile?.display_name ||
    data?.user?.profile?.real_name ||
    data?.user?.real_name ||
    data?.user?.name ||
    userId;

  slackUserNameCache.set(cacheKey, name);
  return name;
}

async function formatSlackHistoryMessage(accessToken: string, message: SlackHistoryMessage) {
  const text = stripSlackMarkup(message.text || "");
  if (!text) return null;

  const author = message.user
    ? await lookupSlackUserName(accessToken, message.user)
    : message.username || (message.bot_id ? "App or workflow" : "Someone");

  return `${author}: ${text}`;
}

export async function fetchSlackConversationContext({
  accessToken,
  channelId,
  channelName,
}: {
  accessToken: string | null;
  channelId?: string | null;
  channelName?: string | null;
}) {
  if (!accessToken || !channelId) return null;

  const data = await slackApiFetch<{ messages?: SlackHistoryMessage[] }>(
    accessToken,
    "conversations.history",
    new URLSearchParams({
      channel: channelId,
      limit: String(MAX_SLACK_CONTEXT_MESSAGES),
      inclusive: "true",
    })
  ).catch(() => null);

  if (!data?.ok || !Array.isArray(data.messages) || data.messages.length === 0) return null;

  const formatted = (
    await Promise.all(data.messages.slice().reverse().map((message) => formatSlackHistoryMessage(accessToken, message)))
  ).filter(Boolean) as string[];

  if (!formatted.length) return null;

  const label = channelName ? `#${channelName}` : "this Slack conversation";
  const context = [`Recent Slack context from ${label} (oldest to newest):`, ...formatted].join("\n");
  return context.length <= MAX_SLACK_CONTEXT_LENGTH
    ? context
    : `${context.slice(0, MAX_SLACK_CONTEXT_LENGTH - 40).trim()}\n[Context trimmed]`;
}

export async function runSlackCoaching({
  user,
  action,
  prompt,
  sourceLabel,
  messageText,
  responseDetail,
}: {
  user: SlackConnectedUser;
  action: "slash_command" | "message_shortcut";
  prompt: string;
  sourceLabel: string;
  messageText?: string | null;
  responseDetail?: SlackResponseDetail;
}) {
  await recordAiUsage(user.id, {
    source: "slack_desktop",
    action,
    metadata: {
      sourceLabel,
      teamName: user.teamName,
      responseDetail: responseDetail || null,
    },
  });

  const system = `You are Beckett, a workplace communication coach for neurodivergent professionals.
You are responding inside Slack, so be concise, practical, and easy to scan.
Help the user understand workplace tone, subtext, context, next steps, and possible replies.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Avoid generic encouragement. Give concrete language the user could use.
Format with short headings and bullets. Do not use markdown tables.
Do not repeat the user's request at the top of the answer; Beckett will add that outside the AI response.`;

  const preferenceLine = user.communicationPreferences.length
    ? `What this user wants Beckett to help with: ${user.communicationPreferences.join(", ")}.`
    : "The user has not set specific Beckett help preferences.";
  const toneLine = user.coachingTone ? `Preferred coaching tone: ${user.coachingTone}.` : "";
  const responseDetailLine =
    responseDetail === "quick"
      ? "Response length: Quick answer. Keep it concise: 2-4 practical bullets, plus suggested wording only if useful."
      : responseDetail === "longer"
        ? "Response length: Longer explanation. Give more context about likely tone/subtext, what to watch for, next steps, and suggested wording. Keep it scannable in Slack."
        : "Response length: Default Slack coaching response. Be concise but useful.";
  const messageLine = messageText ? `\n\nSlack message/context:\n${messageText}` : "";
  const userPrompt = `${preferenceLine}
${toneLine}
${responseDetailLine}

User request:
${prompt}${messageLine}`;

  const maxTokens = responseDetail === "longer" ? 1100 : responseDetail === "quick" ? 650 : 800;
  const text = await callAnthropic(system, [{ role: "user", content: userPrompt }], maxTokens);

  await trackBetaEvent({
    userId: user.id,
    email: user.email || undefined,
    eventName: "analysis_completed",
    source: "slack_desktop",
    metadata: {
      action,
      sourceLabel,
      teamName: user.teamName,
      responseDetail: responseDetail || null,
    },
  });

  return truncateSlackText(text.trim() || "I could not generate a response for that Slack request.");
}

export function handleSlackAiError(error: unknown) {
  if (error instanceof AiUsageLimitError) {
    return `You have reached today’s Beckett beta AI limit. ${error.message}`;
  }

  if (error instanceof Error) return error.message;
  return "Slack coaching failed.";
}

export function truncateSlackText(text: string) {
  if (text.length <= MAX_SLACK_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_SLACK_TEXT_LENGTH - 40).trim()}\n\n_Trimmed for Slack._`;
}
