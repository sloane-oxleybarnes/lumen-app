import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { trackBetaEvent } from "@/lib/beta-events";
import { beckettBoundaryPrompt } from "@/lib/beckett-boundaries";
import { formatCoachingProfileForPrompt } from "@/lib/coaching-profile";
import { slackUserIdentifier } from "@/lib/contact-identifiers";
import {
  lookupRelationshipContextByIdentifier,
  recordSafeInteractionSummary,
} from "@/lib/contact-relationship-context";
import { getPublicSiteUrl } from "@/lib/deployment-env";
import { supabaseAdmin } from "@/lib/server-admin";
import { selectSlackAgentTool, slackAgentToolInstruction } from "@/lib/slack-agent-tools";

const MAX_SLACK_TEXT_LENGTH = 2800;
const MAX_SLACK_CONTEXT_MESSAGES = 8;
const MAX_SLACK_CONTEXT_LENGTH = 2600;
const MAX_SLACK_BROAD_CONTEXT_LENGTH = 2600;
const MAX_SLACK_BROAD_CONTEXT_RESULTS = 12;
const MAX_SLACK_ASKED_PROMPT_LENGTH = 650;
const MAX_QUICK_SLACK_ANSWER_LENGTH = 1200;
const MAX_LONGER_SLACK_ANSWER_LENGTH = 2000;
const DEFAULT_SLACK_GUEST_DAILY_LIMIT = 5;
export const SLACK_SLASH_QUICK_ACTION_ID = "beckett_slash_quick";
export const SLACK_SLASH_LONGER_ACTION_ID = "beckett_slash_longer";
export const REQUIRED_SLACK_USER_SCOPES = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
  "search:read.public",
  "search:read.private",
  "search:read.im",
  "search:read.mpim",
  "search:read.users",
];

export type SlackResponseDetail = "quick" | "longer";
export type SlackCoachingIntent =
  | "general"
  | "rewrite"
  | "decode"
  | "draft"
  | "prep"
  | "tone"
  | "followup"
  | "respond"
  | "clarity"
  | "boundary"
  | "practice";
export type SlackBlock = Record<string, unknown>;
export type SlackContextStatus = "available" | "unavailable";
export type SlackContextFailureReason =
  | "missing_token"
  | "missing_channel"
  | "no_messages"
  | "missing_scope"
  | "not_in_channel"
  | "channel_not_found"
  | "slack_api_error";
export type SlackConversationContext = {
  text: string | null;
  status: SlackContextStatus;
  failureReason: SlackContextFailureReason | null;
  messageCount: number;
  broaderSearchUsed?: boolean;
  retrievalMethod?: string;
};

export function isCompactSlackIntent(intent: SlackCoachingIntent) {
  return intent === "decode" || intent === "respond" || intent === "rewrite";
}

export function shouldUseBroaderSlackContext(intent: SlackCoachingIntent, prompt: string) {
  if (intent === "prep" || intent === "practice") return true;
  const normalized = prompt.toLowerCase();
  return /\b(history|relationship|pattern|before|previous|recently|again|evidence|proof|accomplishment|raise|promotion|manager|1:1|one-on-one|context with|how are things with)\b/.test(normalized);
}

type SlackMessageOptions = {
  blocks?: SlackBlock[];
  replaceOriginal?: boolean;
  responseType?: "ephemeral" | "in_channel";
};

type SlackActionElement = Record<string, unknown>;

type BeckettBlockOptions = {
  title?: string;
  subtitle?: string;
  prompt?: string;
  body?: string;
  footer?: string;
  actions?: SlackActionElement[];
  hideTitle?: boolean;
};

export type SlackConnectedUser = {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  accessToken: string | null;
  botAccessToken: string | null;
  teamName: string | null;
  grantedUserScopes: string[];
  missingUserScopes: string[];
  communicationPreferences: string[];
  coachingTone: string | null;
  strengths: string[];
  workplaceTriggers: string[];
  neurodivergentContext: string[];
  neurodivergentContextOther: string | null;
  toolkitItems: { course_id?: string | null; category?: string | null; label?: string | null; content?: string | null }[];
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
  thread_ts?: string;
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

type SlackSearchContextResponse = {
  ok?: boolean;
  error?: string;
  results?: unknown[] | { messages?: unknown[]; files?: unknown[]; channels?: unknown[] };
  matches?: unknown[];
  messages?: { matches?: unknown[] };
  items?: unknown[];
};

const slackUserNameCache = new Map<string, string>();

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function splitSlackScopes(value: unknown) {
  if (Array.isArray(value)) return value.filter((scope): scope is string => typeof scope === "string");
  return String(value || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function slackUnavailable(reason: SlackContextFailureReason): SlackConversationContext {
  return { text: null, status: "unavailable", failureReason: reason, messageCount: 0 };
}

async function noteSlackContextValidation(userId: string, failureReason: SlackContextFailureReason | null) {
  const { data } = await supabaseAdmin
    .from("user_integrations")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .maybeSingle();
  const metadata = metadataRecord(data?.metadata);
  await supabaseAdmin
    .from("user_integrations")
    .update({
      metadata: {
        ...metadata,
        last_validated_at: new Date().toISOString(),
        last_failure_reason: failureReason,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "slack");
}

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

function splitSlackSectionText(text: string, maxLength = 2850) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength);
    const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
    const cutoff = breakAt > maxLength * 0.5 ? breakAt + 1 : maxLength;
    chunks.push(remaining.slice(0, cutoff).trim());
    remaining = remaining.slice(cutoff).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function removeStandaloneSlackUncertaintySections(text: string) {
  const uncertaintyHeading =
    /^(?:~\s*)?(?:what(?:['’]s| is| isn['’]t)? not knowable|what not to over-?read|what (?:i|beckett) can(?:not|'t|’t) know|unknowns?)(?:\s*~)?\s*:?\s*$/i;
  const knownHeading =
    /^(?:~\s*)?(?:possible read|next move|draft options|what is visible|visible facts|rewritten message|why this works|prep notes|talking points|opening sentence|likely pushback|follow-up draft|conversation goal|practice prompt|direct but kind|warm and collaborative|concise)(?:\s*~)?\s*:?\s*$/i;
  const lines = text.split("\n");
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (uncertaintyHeading.test(trimmed)) {
      skipping = true;
      continue;
    }
    if (skipping && knownHeading.test(trimmed)) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n");
}

function canonicalSlackHeading(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "possible read") return "Possible read";
  if (normalized === "next move") return "Next move";
  if (normalized === "draft options") return "Draft options";
  return null;
}

function canonicalDraftLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "direct but kind") return "Direct but kind";
  if (normalized === "warm and collaborative") return "Warm and collaborative";
  if (normalized === "concise") return "Concise";
  return null;
}

function formatSlackCoachingDisplayText(text: string) {
  const lines = text.split("\n");
  const formatted: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const heading = canonicalSlackHeading(trimmed.replace(/^~\s*|\s*~$/g, "").replace(/:$/, ""));
    if (heading) {
      formatted.push(`~ ${heading} ~`);
      continue;
    }

    const draftMatch = trimmed.match(/^[-•]?\s*(Direct but kind|Warm and collaborative|Concise)\s*:?\s*(.*)$/i);
    if (draftMatch) {
      const label = canonicalDraftLabel(draftMatch[1]) || draftMatch[1];
      const inlineText = draftMatch[2]?.trim();
      if (inlineText) {
        formatted.push(`- ${label}: ${inlineText}`);
        continue;
      }

      let nextIndex = index + 1;
      while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
      const nextLine = lines[nextIndex]?.trim();
      const nextIsHeading = nextLine
        ? Boolean(canonicalSlackHeading(nextLine.replace(/^~\s*|\s*~$/g, "").replace(/:$/, "")))
        : false;
      const nextIsDraftLabel = nextLine
        ? /^[-•]?\s*(Direct but kind|Warm and collaborative|Concise)\s*:?\s*/i.test(nextLine)
        : false;

      if (nextLine && !nextIsHeading && !nextIsDraftLabel) {
        formatted.push(`- ${label}: ${nextLine}`);
        index = nextIndex;
        continue;
      }

      formatted.push(`- ${label}:`);
      continue;
    }

    formatted.push(line);
  }

  return formatted.join("\n");
}

export function cleanSlackDisplayText(text: string) {
  const plainText = removeStandaloneSlackUncertaintySections(text)
    .replace(/\*\*([^*\n][^*]*?)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n][^*]*?)\*(?=\s|$|[.,!?;:])/g, "$1$2")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return formatSlackCoachingDisplayText(plainText);
}

function formatSlackMrkdwnForBlocks(text: string) {
  return text
    .replace(/^(Possible read|Next move|Draft options)\s*:?\s*$/gim, "*$1*")
    .replace(/^[-•]?\s*(Direct but kind|Warm and collaborative|Concise)\s*:\s*/gim, "- $1: ")
    .replace(/^(What(?:['’]s| is| isn['’]t) not knowable|What not to over-?read)\s*:?\s*$/gim, "");
}

export function buildBeckettBlocks({
  title = "Beckett",
  subtitle = "Communication coach",
  prompt,
  body,
  footer,
  actions,
  hideTitle = false,
}: BeckettBlockOptions): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  if (!hideTitle) {
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: title.slice(0, 150) },
    });
  }

  if (subtitle) {
    blocks.push({
      type: "context",
      elements: [{ type: "plain_text", text: subtitle.slice(0, 300) }],
    });
  }

  if (prompt) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_${escapeSlackMrkdwn(cleanSlackDisplayText(prompt)).slice(0, 900)}_`,
      },
    });
  }

  if (body) {
    blocks.push({ type: "divider" });
    for (const chunk of splitSlackSectionText(cleanSlackDisplayText(body))) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: formatSlackMrkdwnForBlocks(chunk) },
      });
    }
  }

  if (actions?.length) {
    blocks.push({ type: "actions", elements: actions });
  }

  if (footer) {
    blocks.push({
      type: "context",
      elements: [{ type: "plain_text", text: cleanSlackDisplayText(footer).slice(0, 300) }],
    });
  }

  return blocks.slice(0, 48);
}

export function buildBeckettPayload({
  title,
  subtitle,
  prompt,
  body,
  footer,
  actions,
  hideTitle,
}: BeckettBlockOptions) {
  const cleanedBody = cleanSlackDisplayText(body || "");
  const fallback = [hideTitle ? null : title || "Beckett", subtitle, prompt, cleanedBody, footer]
    .filter(Boolean)
    .join("\n\n");
  return {
    text: truncateSlackText(cleanSlackDisplayText(fallback || "Beckett is ready.")),
    blocks: buildBeckettBlocks({ title, subtitle, prompt, body: cleanedBody, footer, actions, hideTitle }),
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

export function getSlackGuestDailyLimit() {
  const configured = Number(process.env.SLACK_GUEST_DAILY_AI_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SLACK_GUEST_DAILY_LIMIT;
}

export class SlackGuestUsageLimitError extends Error {
  status = 429;

  constructor(public limit: number) {
    super(`Guest Slack coaching is limited to ${limit} analyses per day. Connect Slack in Beckett Settings for the full beta experience.`);
  }
}

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function recordSlackGuestUsage({
  teamId,
  slackUserId,
  action,
  metadata,
}: {
  teamId: string;
  slackUserId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  const limit = getSlackGuestDailyLimit();
  const { count, error: countError } = await supabaseAdmin
    .from("slack_guest_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .gte("created_at", startOfUtcDay());

  if (countError) throw countError;
  const used = count || 0;
  if (used >= limit) throw new SlackGuestUsageLimitError(limit);

  const { error } = await supabaseAdmin.from("slack_guest_usage_events").insert({
    slack_team_id: teamId,
    slack_user_id: slackUserId,
    source: "slack_guest",
    action,
    token_estimate: 1,
    metadata: metadata || {},
  });

  if (error) throw error;
  return { limit, used: used + 1, remaining: Math.max(limit - used - 1, 0) };
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

export function slackAskedLabel(intent: SlackCoachingIntent = "general") {
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
    case "respond":
      return "You asked Beckett to help you respond:";
    case "clarity":
      return "You asked Beckett to help you ask for clarity:";
    case "boundary":
      return "You asked Beckett to help with a boundary:";
    case "practice":
      return "You asked Beckett to help you practice:";
    default:
      return "You asked:";
  }
}

export function formatAskedResponse(prompt: string, response: string, intent: SlackCoachingIntent = "general") {
  const header = [slackAskedLabel(intent), `>${formatAskedPrompt(prompt)}`, ""].join("\n");
  const availableAnswerLength = Math.max(800, MAX_SLACK_TEXT_LENGTH - header.length - 2);
  return cleanSlackDisplayText(`${header}\n${fitSlackAnswer(response, availableAnswerLength)}`);
}

export function buildAskedResponsePayload({
  prompt,
  response,
  intent = "general",
  footer,
}: {
  prompt: string;
  response: string;
  intent?: SlackCoachingIntent;
  footer?: string;
}) {
  const label = slackAskedLabel(intent).replace(/:$/, "");
  return buildBeckettPayload({
    title: "Beckett",
    subtitle: label,
    prompt,
    body: fitSlackAnswer(response, MAX_LONGER_SLACK_ANSWER_LENGTH),
    footer,
  });
}

function slackIntentInstruction(intent: SlackCoachingIntent) {
  switch (intent) {
    case "rewrite":
      return "Slack task: Rewrite or improve the user's draft. Preserve the meaning, make it natural for workplace Slack/email, and briefly explain the main tone choice.";
    case "decode":
      return "Slack task: Decode the pasted message or recent context. Use Possible read and Next move. Answer from visible Slack context first when available. Keep uncertainty inside Possible read instead of making a separate not-knowable section.";
    case "draft":
      return "Slack task: Draft a message from the user's goal. Provide ready-to-use wording and briefly name any assumptions.";
    case "prep":
      return "Slack task: Help the user prepare for a workplace conversation. Cover how to start, how it might go, likely pushback, and what to watch for.";
    case "tone":
      return "Slack task: Check how the wording may land. Identify tone risks, then offer a cleaner version if useful.";
    case "followup":
      return "Slack task: Help write or improve a follow-up. Keep it specific, low-pressure, and clear about the next step.";
    case "respond":
      return "Slack task: Help the user respond to the Slack context. Answer from visible Slack context first when available. Use Possible read, Next move, and Draft options. Draft options should be bullets labeled Direct but kind, Warm and collaborative, and Concise.";
    case "clarity":
      return "Slack task: Help the user ask for clarity. Identify the missing information, draft a specific answerable question, and remove unnecessary apologies.";
    case "boundary":
      return "Slack task: Help the user set a workplace boundary. Keep it firm, kind, specific, and realistic for Slack.";
    case "practice":
      return "Slack task: Prepare the user to practice a difficult workplace conversation. Give an opening line, likely pushback, and a short rehearsal plan.";
    default:
      return "Slack task: General Beckett coaching. Answer the user's specific request directly.";
  }
}

export async function lookupSlackConnectedUser(teamId: string, slackUserId: string) {
  const { data: integration, error } = await supabaseAdmin
    .from("user_integrations")
    .select("user_id, access_token, external_team_name, metadata")
    .eq("provider", "slack")
    .eq("external_team_id", teamId)
    .eq("external_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  if (!integration?.user_id) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, email, display_name, first_name, full_name, plan, communication_preferences, coaching_tone, strengths, workplace_triggers, neurodivergent_context, neurodivergent_context_other"
    )
    .eq("id", integration.user_id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  const metadata = metadataRecord(integration.metadata);
  const authedUser = metadataRecord(metadata.authed_user);
  const grantedUserScopes = splitSlackScopes(metadata.granted_user_scopes || authedUser.scope || metadata.user_scope);
  const missingUserScopes = REQUIRED_SLACK_USER_SCOPES.filter((scope) => !grantedUserScopes.includes(scope));
  const { data: toolkitItems } = await supabaseAdmin
    .from("course_toolkit_items")
    .select("course_id, category, label, content, updated_at")
    .eq("user_id", profile.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(6);

  return {
    id: profile.id,
    email: profile.email || null,
    name: profile.display_name || profile.first_name || profile.full_name || null,
    plan: profile.plan || "free",
    accessToken: integration.access_token || null,
    botAccessToken: typeof metadata.access_token === "string" ? metadata.access_token : null,
    teamName: integration.external_team_name || null,
    grantedUserScopes,
    missingUserScopes,
    communicationPreferences: Array.isArray(profile.communication_preferences)
      ? profile.communication_preferences
      : [],
    coachingTone: profile.coaching_tone || null,
    strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
    workplaceTriggers: Array.isArray(profile.workplace_triggers) ? profile.workplace_triggers : [],
    neurodivergentContext: Array.isArray(profile.neurodivergent_context)
      ? profile.neurodivergent_context
      : [],
    neurodivergentContextOther: profile.neurodivergent_context_other || null,
    toolkitItems: toolkitItems || [],
  } satisfies SlackConnectedUser;
}

export async function lookupSlackWorkspaceBotToken(teamId: string) {
  if (!teamId) return null;

  const { data, error } = await supabaseAdmin
    .from("user_integrations")
    .select("metadata")
    .eq("provider", "slack")
    .eq("external_team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const metadata = metadataRecord(data?.metadata);
  return typeof metadata.access_token === "string" ? metadata.access_token : null;
}

export async function slackApiPost<T>(accessToken: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({})) as Promise<T & { ok?: boolean; error?: string }>;
}

async function openSlackAgentChannel(botAccessToken: string, slackUserId: string) {
  const opened = await slackApiPost<{ channel?: { id?: string } }>(botAccessToken, "conversations.open", {
    users: slackUserId,
  });
  const channelId = opened.channel?.id;
  if (!opened.ok || !channelId) return { ok: false, error: opened.error || "dm_open_failed" };
  return { ok: true, channelId };
}

export async function setSlackAgentSuggestedPrompts({
  botAccessToken,
  channelId,
  title = "What can I help with today?",
}: {
  botAccessToken: string | null;
  channelId: string;
  title?: string;
}) {
  if (!botAccessToken || !channelId) return { ok: false, error: "missing_agent_context" };

  return slackApiPost(botAccessToken, "assistant.threads.setSuggestedPrompts", {
    channel_id: channelId,
    title,
    prompts: [
      {
        title: "Decode a Message",
        message: "Help me decode the current message without over-reading it.",
      },
      {
        title: "Respond to a Message",
        message: "Help me draft a clear response to the current conversation.",
      },
      {
        title: "Rewrite a Message",
        message: "Help me rewrite my response so it is clearer and kinder.",
      },
      {
        title: "Prep / Practice",
        message: "Help me prepare for a difficult conversation.",
      },
    ],
  });
}

export async function configureSlackAgentSurface({
  botAccessToken,
  slackUserId,
  channelId,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  channelId?: string | null;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };
  const targetChannelId = channelId || (await openSlackAgentChannel(botAccessToken, slackUserId)).channelId;
  if (!targetChannelId) return { ok: false, error: "agent_channel_unavailable" };

  await setSlackAgentSuggestedPrompts({
    botAccessToken,
    channelId: targetChannelId,
  });

  return { ok: true, channelId: targetChannelId };
}

export async function postSlackAgentMessage({
  botAccessToken,
  slackUserId,
  text,
  title,
  subtitle = "",
}: {
  botAccessToken: string | null;
  slackUserId: string;
  text: string;
  title: string;
  subtitle?: string;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };

  const opened = await openSlackAgentChannel(botAccessToken, slackUserId);
  if (!opened.ok || !opened.channelId) return opened;
  const channelId = opened.channelId;

  const payload = buildBeckettPayload({
    title: "Beckett",
    subtitle,
    body: text,
    hideTitle: true,
  });

  const posted = await slackApiPost<{ ts?: string }>(botAccessToken, "chat.postMessage", {
    channel: channelId,
    ...payload,
  });
  if (!posted.ok || !posted.ts) return { ok: false, error: posted.error || "agent_post_failed" };

  await slackApiPost(botAccessToken, "assistant.threads.setTitle", {
    channel_id: channelId,
    thread_ts: posted.ts,
    title: title.slice(0, 80),
  }).catch(() => null);

  await setSlackAgentSuggestedPrompts({
    botAccessToken,
    channelId,
  }).catch(() => null);

  return { ok: true, channelId, ts: posted.ts };
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

function compactText(value: string, maxLength: number) {
  const text = stripSlackMarkup(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 18).trim()} [trimmed]`;
}

function pickString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

function extractSearchText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  const directText = pickString(record, ["content", "text", "snippet", "summary", "title"]);
  const contentText =
    typeof record.content === "object" && record.content
      ? pickString(record.content, ["text", "snippet", "summary", "title"])
      : "";
  const messageText =
    typeof record.message === "object" && record.message
      ? pickString(record.message, ["text", "snippet", "summary"])
      : "";
  const contextRecord = metadataRecord(record.context_messages);
  const contextValues = Array.isArray(record.context_messages)
    ? record.context_messages
    : [
        ...(Array.isArray(contextRecord.before) ? contextRecord.before : []),
        ...(Array.isArray(contextRecord.after) ? contextRecord.after : []),
      ];
  const contextMessages = contextValues
    .map((item) => (typeof item === "object" && item ? pickString(item, ["text", "snippet", "summary", "content"]) : ""))
    .filter(Boolean)
    .join(" / ");

  return [contextMessages, directText, contentText, messageText].filter(Boolean).join(" / ");
}

function extractSearchLabel(result: unknown) {
  if (!result || typeof result !== "object") return "Slack result";
  const record = result as Record<string, unknown>;
  const channel = metadataRecord(record.channel);
  const user = metadataRecord(record.user);
  const channelName = pickString(channel, ["name", "id"]) || pickString(record, ["channel_name", "channel_id"]);
  const userName = pickString(user, ["name", "real_name", "id"]) || pickString(record, ["author_name", "author_user_id", "user_id"]);
  const source = pickString(record, ["source", "type"]);
  return channelName ? `#${channelName}` : userName ? userName : source || "Slack result";
}

function getSearchResults(data: SlackSearchContextResponse | null) {
  if (!data?.ok) return [];
  if (data.results && !Array.isArray(data.results) && Array.isArray(data.results.messages)) return data.results.messages;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.matches)) return data.matches;
  if (Array.isArray(data.messages?.matches)) return data.messages.matches;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function buildBroaderSearchQuery(prompt: string, activeContext?: string | null) {
  const base = [prompt, activeContext ? activeContext.replace(/\n/g, " ") : ""].join(" ");
  const withoutSlackSyntax = stripSlackMarkup(base);
  const words = withoutSlackSyntax
    .split(/\s+/)
    .map((word) => word.replace(/[^\w@#.-]/g, ""))
    .filter((word) => word.length > 2);
  const priority = words.filter((word) =>
    /manager|raise|promotion|salary|workload|feedback|priority|project|blocker|review|1:1|one-on-one/i.test(word)
  );
  const names = words.filter((word) => /^[A-Z][a-z]+/.test(word)).slice(0, 6);
  const combined = [...priority, ...names, ...words.slice(0, 18)];
  const deduped = Array.from(new Set(combined)).slice(0, 24).join(" ");
  return deduped || prompt.slice(0, 240);
}

export async function lookupSlackUserProfile(accessToken: string, userId: string) {
  const cacheKey = `${accessToken.slice(-8)}:${userId}`;
  const cached = slackUserNameCache.get(cacheKey);
  if (cached) return { id: userId, name: cached, aliases: [cached] };

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
  const aliases = Array.from(
    new Set(
      [
        data?.user?.profile?.display_name,
        data?.user?.profile?.real_name,
        data?.user?.real_name,
        data?.user?.name,
        name,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  slackUserNameCache.set(cacheKey, name);
  return { id: data?.user?.id || userId, name, aliases };
}

async function lookupSlackUserName(accessToken: string, userId: string) {
  const profile = await lookupSlackUserProfile(accessToken, userId);
  return profile.name;
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
  messageTs,
  threadTs,
}: {
  accessToken: string | null;
  channelId?: string | null;
  channelName?: string | null;
  messageTs?: string | null;
  threadTs?: string | null;
}) {
  if (!accessToken) return slackUnavailable("missing_token");
  if (!channelId) return slackUnavailable("missing_channel");

  const fetchRecentHistory = () => {
    const params = new URLSearchParams({
      channel: channelId,
      limit: String(MAX_SLACK_CONTEXT_MESSAGES),
      inclusive: "true",
    });
    if (messageTs && !threadTs) params.set("latest", messageTs);
    return slackApiFetch<{ messages?: SlackHistoryMessage[] }>(
      accessToken,
      "conversations.history",
      params
    ).catch(() => null);
  };

  const fetchThreadReplies = (replyTs: string) =>
    slackApiFetch<{ messages?: SlackHistoryMessage[] }>(
        accessToken,
        "conversations.replies",
        new URLSearchParams({
          channel: channelId,
          ts: replyTs,
          limit: String(MAX_SLACK_CONTEXT_MESSAGES),
          inclusive: "true",
        })
      ).catch(() => null);

  const historyData = await fetchRecentHistory();
  const replyTs = threadTs || null;
  const replyData = replyTs ? await fetchThreadReplies(replyTs) : null;
  const fallbackReplyData =
    !replyData && messageTs && (!historyData?.ok || (Array.isArray(historyData.messages) && historyData.messages.length <= 1))
      ? await fetchThreadReplies(messageTs)
      : null;

  const reasonFor = (data: { ok?: boolean; error?: string } | null | undefined): SlackContextFailureReason => {
    if (data?.error === "missing_scope") return "missing_scope";
    if (data?.error === "not_in_channel") return "not_in_channel";
    if (data?.error === "channel_not_found") return "channel_not_found";
    return "slack_api_error";
  };

  const formatMessages = async (messages: SlackHistoryMessage[] | undefined) =>
    (
      await Promise.all((messages || []).slice().reverse().map((message) => formatSlackHistoryMessage(accessToken, message)))
    ).filter(Boolean) as string[];

  const historyMessages = historyData?.ok ? await formatMessages(historyData.messages) : [];
  const threadMessages = replyData?.ok
    ? await formatMessages(replyData.messages)
    : fallbackReplyData?.ok
      ? await formatMessages(fallbackReplyData.messages)
      : [];

  if (!historyMessages.length && !threadMessages.length) {
    const failedData = historyData && !historyData.ok ? historyData : replyData && !replyData.ok ? replyData : fallbackReplyData;
    const reason = failedData ? reasonFor(failedData) : "no_messages";
    return slackUnavailable(reason);
  }

  const label = channelName ? `#${channelName}` : "this Slack conversation";
  const sections: string[] = [];
  const seen = new Set<string>();

  const addSection = (heading: string, lines: string[]) => {
    const unique = lines.filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) sections.push([heading, ...unique].join("\n"));
  };

  addSection(`Recent Slack context from ${label} (oldest to newest):`, historyMessages);
  addSection(`Slack thread context from ${label} (oldest to newest):`, threadMessages);

  const context = sections.join("\n\n");
  const messageCount = seen.size;
  const retrievalMethod =
    historyMessages.length && threadMessages.length
      ? "history_and_replies"
      : threadMessages.length
        ? "replies"
        : "history";
  return {
    text:
      context.length <= MAX_SLACK_CONTEXT_LENGTH
        ? context
        : `${context.slice(0, MAX_SLACK_CONTEXT_LENGTH - 40).trim()}\n[Context trimmed]`,
    status: "available",
    failureReason: null,
    messageCount,
    retrievalMethod,
  } satisfies SlackConversationContext;
}

export async function fetchSlackBroaderContext({
  accessToken,
  prompt,
  activeContext,
  contextChannelId,
  actionToken,
}: {
  accessToken: string | null;
  prompt: string;
  activeContext?: string | null;
  contextChannelId?: string | null;
  actionToken?: string | null;
}) {
  if (!accessToken) return slackUnavailable("missing_token");

  const query = buildBroaderSearchQuery(prompt, activeContext);
  const body: Record<string, unknown> = {
    query,
    content_types: "messages,users",
    channel_types: "public_channel,private_channel,mpim,im",
    include_context_messages: true,
    limit: MAX_SLACK_BROAD_CONTEXT_RESULTS,
  };
  if (contextChannelId) body.context_channel_id = contextChannelId;
  if (actionToken) body.action_token = actionToken;

  const data = await slackApiPost<SlackSearchContextResponse>(accessToken, "assistant.search.context", body).catch(
    () => null
  );
  if (!data?.ok) {
    return slackUnavailable(data?.error === "missing_scope" ? "missing_scope" : "slack_api_error");
  }

  const formatted = getSearchResults(data)
    .map((result) => {
      const text = compactText(extractSearchText(result), 380);
      if (!text) return null;
      return `${extractSearchLabel(result)}: ${text}`;
    })
    .filter(Boolean)
    .slice(0, MAX_SLACK_BROAD_CONTEXT_RESULTS) as string[];

  if (!formatted.length) return slackUnavailable("no_messages");

  const context = ["Relevant prior Slack history from live search:", ...formatted].join("\n");
  return {
    text:
      context.length <= MAX_SLACK_BROAD_CONTEXT_LENGTH
        ? context
        : `${context.slice(0, MAX_SLACK_BROAD_CONTEXT_LENGTH - 40).trim()}\n[Broader context trimmed]`,
    status: "available",
    failureReason: null,
    messageCount: formatted.length,
    broaderSearchUsed: true,
  } satisfies SlackConversationContext;
}

export async function buildSlackCoachingContext({
  user,
  prompt,
  activeContext,
  contextChannelId,
  actionToken,
  includeBroaderContext = true,
}: {
  user: SlackConnectedUser;
  prompt: string;
  activeContext?: SlackConversationContext | null;
  contextChannelId?: string | null;
  actionToken?: string | null;
  includeBroaderContext?: boolean;
}) {
  const broaderContext = includeBroaderContext
    ? await fetchSlackBroaderContext({
        accessToken: user.accessToken,
        prompt,
        activeContext: activeContext?.text,
        contextChannelId,
        actionToken,
      })
    : slackUnavailable("no_messages");

  const sections = [
    activeContext?.text ? `Active Slack context:\n${activeContext.text}` : "",
    broaderContext.text ? `Relevant prior Slack history:\n${broaderContext.text}` : "",
  ].filter(Boolean);
  const primaryStatus: SlackContextStatus =
    activeContext?.status === "available" || broaderContext.status === "available" ? "available" : "unavailable";
  const failureReason =
    primaryStatus === "available"
      ? broaderContext.status === "unavailable"
        ? broaderContext.failureReason
        : activeContext?.failureReason || null
      : broaderContext.failureReason || activeContext?.failureReason || "slack_api_error";

  return {
    text: sections.join("\n\n") || null,
    status: primaryStatus,
    failureReason,
    messageCount: (activeContext?.messageCount || 0) + (broaderContext.messageCount || 0),
    broaderSearchUsed: broaderContext.status === "available",
    activeContext,
    broaderContext,
  };
}

export async function resolveSlackAuthorRelationshipContext({
  user,
  teamId,
  slackAuthorUserId,
  interactionType,
}: {
  user: SlackConnectedUser;
  teamId: string;
  slackAuthorUserId?: string | null;
  interactionType: string;
}) {
  const identifier = slackUserIdentifier(teamId, slackAuthorUserId);
  if (!identifier) return null;

  const slackProfile =
    user.accessToken && slackAuthorUserId
      ? await lookupSlackUserProfile(user.accessToken, slackAuthorUserId).catch(() => null)
      : null;
  let relationshipContext = await lookupRelationshipContextByIdentifier({
    userId: user.id,
    identifier,
    requireConfirmed: true,
  });
  let matchedBy = "confirmed_slack_user_id";

  for (const alias of slackProfile?.aliases || []) {
    if (relationshipContext) break;
    relationshipContext = await lookupRelationshipContextByIdentifier({
      userId: user.id,
      identifier: {
        platform: "slack",
        identifier: alias,
        confirmed: false,
      },
      requireConfirmed: false,
    });
    matchedBy = "slack_profile_alias";
  }

  if (!relationshipContext) {
    return {
      linked: false,
      slackProfile,
      slackIdentifier: identifier.identifier,
      promptContext: null,
    };
  }

  await recordSafeInteractionSummary({
    userId: user.id,
    contactId: relationshipContext.contact.id,
    platform: "slack",
    interactionType,
    summary: `Slack coaching was requested for ${relationshipContext.contact.name}. Beckett matched this person by ${matchedBy} and used stored relationship context.`,
    metadata: {
      source: interactionType,
      slack_team_id: teamId,
      slack_user_id: slackAuthorUserId || null,
      slack_display_name: slackProfile?.name || null,
      matched_by: matchedBy,
    },
    updateRelationshipSummary: false,
  }).catch((error) => {
    console.error("Slack relationship summary storage failed", error);
  });

  return {
    linked: true,
    slackProfile,
    slackIdentifier: identifier.identifier,
    contact: relationshipContext.contact,
    promptContext: relationshipContext.promptContext,
  };
}

export function slackContextUserNote(context: SlackConversationContext) {
  if (context.status === "available") return "";
  switch (context.failureReason) {
    case "missing_scope":
      return "_I could not read broader Slack context because this Slack connection is missing the newest search/private-channel permissions. Reconnect Slack from Beckett Settings when you want broader context included._";
    case "not_in_channel":
    case "channel_not_found":
      return "_I could not read recent Slack context for this conversation, so I am answering from what you asked._";
    case "no_messages":
      return "_I could not find recent Slack messages to include, so I am answering from what you asked._";
    case "missing_token":
      return "_Slack context is not connected yet, so I am answering from what you asked._";
    default:
      return "_I could not read recent Slack context this time, so I am answering from what you asked._";
  }
}

export function slackContextDebugLine(context: {
  status: SlackContextStatus;
  failureReason?: SlackContextFailureReason | null;
  messageCount?: number;
  broaderSearchUsed?: boolean;
  retrievalMethod?: string;
  activeContext?: SlackConversationContext | null;
  broaderContext?: SlackConversationContext | null;
}) {
  const describe = (label: string, item?: SlackConversationContext | null) => {
    if (!item) return `${label}: not requested`;
    if (item.status !== "available") return `${label}: unavailable (${item.failureReason || "unknown"})`;
    const method = item.retrievalMethod ? `, ${item.retrievalMethod}` : "";
    return `${label}: ${item.messageCount} message${item.messageCount === 1 ? "" : "s"}${method}`;
  };

  const parts =
    context.activeContext || context.broaderContext
      ? [
          describe("active/linked conversation", context.activeContext),
          describe("broader Slack history", context.broaderContext),
        ]
      : [
          context.status === "available"
            ? `Slack context: ${context.messageCount || 0} message${context.messageCount === 1 ? "" : "s"}${context.retrievalMethod ? `, ${context.retrievalMethod}` : ""}`
            : `Slack context: unavailable (${context.failureReason || "unknown"})`,
        ];

  return `Context pulled: ${parts.join("; ")}.`;
}

export async function runSlackCoaching({
  user,
  action,
  prompt,
  sourceLabel,
  messageText,
  contextStatus,
  contextFailureReason,
  contextMessageCount,
  broaderSearchUsed,
  relationshipContext,
  responseDetail,
  intent = "general",
}: {
  user: SlackConnectedUser;
  action: "slash_command" | "message_shortcut" | "agent_message";
  prompt: string;
  sourceLabel: string;
  messageText?: string | null;
  contextStatus?: SlackContextStatus;
  contextFailureReason?: SlackContextFailureReason | null;
  contextMessageCount?: number;
  broaderSearchUsed?: boolean;
  relationshipContext?: string | null;
  responseDetail?: SlackResponseDetail;
  intent?: SlackCoachingIntent;
}) {
  if (contextStatus) {
    await noteSlackContextValidation(
      user.id,
      contextStatus === "available" ? null : contextFailureReason || "slack_api_error"
    ).catch((error) => {
      console.error("Slack context validation metadata update failed", error);
    });
  }

  await recordAiUsage(user.id, {
    source: "slack_desktop",
    action,
    metadata: {
      sourceLabel,
      teamName: user.teamName,
      contextStatus: contextStatus || null,
      contextFailureReason: contextFailureReason || null,
      contextMessageCount: contextMessageCount || 0,
      broaderSearchUsed: Boolean(broaderSearchUsed),
      relationshipContextIncluded: Boolean(relationshipContext),
      responseDetail: responseDetail || null,
      intent,
      agentTool: selectSlackAgentTool({
        intent,
        action,
        hasSlackContext: Boolean(messageText || relationshipContext || contextStatus === "available"),
      }),
    },
  });

  const agentTool = selectSlackAgentTool({
    intent,
    action,
    hasSlackContext: Boolean(messageText || relationshipContext || contextStatus === "available"),
  });

  const system = `You are Beckett, a workplace and workplace-adjacent communication coach for neurodivergent professionals.
You are responding inside Slack, so be concise, practical, and easy to scan.
Help the user understand tone, subtext, context, next steps, and possible replies across workplace, workplace-adjacent, friendly, and personal Slack conversations.
Do not refuse just because the Slack context is personal, casual, friendly, or not strictly work-related. If the user asks for help responding, decoding, or rewriting, help with the conversation they provided.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Do not hallucinate reactions, comfort, rapport, agreement, annoyance, or pushback that is not visible in the provided Slack text.
Always separate "what is visible" from "possible interpretation" when decoding a Slack message or thread.
When broader Slack history is included, clearly distinguish active-thread facts from relevant prior history. Prior history can shape preparation, but it does not prove current intent.
When active Slack context is available, answer from that visible conversation first. Do not ask broad relationship-history or background questions unless the user explicitly asks for a broad relationship assessment.
If active Slack context is available but broader Slack history or saved relationship context is missing, do not treat that as a blocker. Mention it only briefly when relevant.
Do not say you cannot access DMs, direct messages, private channels, or Slack history as a general capability claim. You may only describe the specific Slack context status provided in the prompt, such as missing permissions, not in channel, no messages found, or linked context available.
If Slack context is unavailable for a prep request, continue coaching from the user's stated scenario instead of saying you need the actual pattern first.
If the user is over-reading an ambiguous message, fold what is uncertain or not knowable into the Possible read section in one concise sentence.
Avoid generic encouragement. Give concrete language the user could use.
Format with short plain-language section labels and bullets. Do not use markdown tables, markdown bold markers, or literal asterisks; Beckett formats headings separately.
For decode/respond work, prefer these section labels when they fit: Possible read, Next move, Draft options.
Never include a standalone "What's not knowable", "What is not knowable", "What isn't knowable", or "What not to over-read" section.
For preparation work, prefer short coach-card sections when they fit: Goal, Say this first, If they push back, Watch for, Practice next.
Do not repeat the user's request at the top of the answer; Beckett will add that outside the AI response.
For reply drafting, include 2-3 Slack-ready bullet options when useful: - Direct but kind, - Warm and collaborative, and - Concise.
For difficult conversation prep, include talking points, an opening sentence, likely pushback, and a short follow-up draft.
Beckett suggests and coaches; it does not tell the user to act automatically.
Do not add generic privacy or shared-channel warnings just because Slack context includes both personal and work topics.
Only mention privacy, shared-channel, or workplace policy risk when the user's request is about posting in a public/shared channel, the context clearly includes sensitive personal information, or the requested message could create a concrete workplace safety or policy concern.
${slackAgentToolInstruction(agentTool)}
${beckettBoundaryPrompt()}`;

  const coachingProfileContext = formatCoachingProfileForPrompt(
    {
      display_name: user.name,
      communication_preferences: user.communicationPreferences,
      coaching_tone: user.coachingTone,
      strengths: user.strengths,
      workplace_triggers: user.workplaceTriggers,
      neurodivergent_context: user.neurodivergentContext,
      neurodivergent_context_other: user.neurodivergentContextOther,
    },
    user.toolkitItems
  );
  const responseDetailLine =
    responseDetail === "quick"
      ? "Response length: Quick answer. Keep it concise: 2-4 practical bullets, plus suggested wording only if useful. Keep the answer under 700 characters."
      : responseDetail === "longer"
        ? "Response length: Longer explanation. Give more context about likely tone/subtext, what to watch for, next steps, and suggested wording. Keep it scannable in Slack and under 1700 characters."
        : "Response length: Default Slack coaching response. Be concise but useful.";
  const contextLine = contextStatus
    ? `Slack context status: ${contextStatus}${contextFailureReason ? ` (${contextFailureReason})` : ""}. Broader Slack search used: ${broaderSearchUsed ? "yes" : "no"}.`
    : "";
  const messageLine = messageText
    ? `\n\nSlack context packet:\n${messageText}`
    : contextStatus === "unavailable"
      ? isCompactSlackIntent(intent)
        ? "\n\nNo recent Slack context was available. If the user did not provide message text, say exactly: I could not read this Slack conversation. Paste or paraphrase the message and I’ll help."
        : "\n\nNo recent Slack context was available. Answer from the user's request without implying you saw surrounding messages."
      : "";
  const relationshipLine = relationshipContext
    ? `\n\nConfirmed relationship context:\n${relationshipContext}`
    : "";
  const userPrompt = `${coachingProfileContext || "The user has not set specific Beckett coaching preferences yet."}
${responseDetailLine}
${contextLine}
${slackIntentInstruction(intent)}

User request:
${prompt}${relationshipLine}${messageLine}`;

  const maxTokens = responseDetail === "longer" ? 700 : responseDetail === "quick" ? 360 : 800;
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
      contextStatus: contextStatus || null,
      contextFailureReason: contextFailureReason || null,
      contextMessageCount: contextMessageCount || 0,
      broaderSearchUsed: Boolean(broaderSearchUsed),
      relationshipContextIncluded: Boolean(relationshipContext),
      responseDetail: responseDetail || null,
      intent,
      agentTool,
    },
  });

  const cleaned = text.trim() || "I could not generate a response for that Slack request.";
  if (responseDetail === "quick") return fitSlackAnswer(cleaned, MAX_QUICK_SLACK_ANSWER_LENGTH);
  if (responseDetail === "longer") return fitSlackAnswer(cleaned, MAX_LONGER_SLACK_ANSWER_LENGTH);
  return truncateSlackText(cleaned);
}

export async function runSlackGuestCoaching({
  teamId,
  slackUserId,
  action,
  prompt,
  messageText,
  intent = "general",
}: {
  teamId: string;
  slackUserId: string;
  action: "slash_command" | "message_shortcut" | "agent_message";
  prompt: string;
  messageText: string;
  intent?: SlackCoachingIntent;
}) {
  const cleanMessageText = messageText.trim();
  if (!cleanMessageText) {
    return [
      "I can help, but I could not read this Slack conversation without a connected Beckett profile.",
      "",
      "Paste or paraphrase the message and I’ll analyze it here.",
    ].join("\n");
  }

  await recordSlackGuestUsage({
    teamId,
    slackUserId,
    action,
    metadata: {
      intent,
      messageLength: cleanMessageText.length,
      connectedProfile: false,
    },
  });

  const agentTool = selectSlackAgentTool({
    intent,
    action,
    hasSlackContext: Boolean(cleanMessageText),
  });
  const system = `You are Beckett, a workplace and workplace-adjacent communication coach for neurodivergent professionals.
You are responding inside Slack, so be concise, practical, and easy to scan.
The Slack user is using guest mode. You do not have their Beckett coaching profile, contact memory, saved history, or broader Slack search.
Help with workplace, workplace-adjacent, friendly, logistics, and personal Slack conversations when the user asks for decode, respond, or rewrite help.
Do not refuse because a message is personal or casual.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Do not hallucinate reactions, comfort, rapport, agreement, annoyance, or pushback that is not visible in the provided Slack text.
Always separate visible facts from possible interpretation when decoding.
Fold what is uncertain or not knowable into the Possible read section in one concise sentence; never include a standalone "What's not knowable", "What is not knowable", "What isn't knowable", or "What not to over-read" section.
If there is not enough text to analyze, ask the user to paste or paraphrase the message.
For reply drafting, include 2-3 Slack-ready bullet options when useful: - Direct but kind, - Warm and collaborative, and - Concise.
Format with short plain-language section labels and bullets. Do not use markdown tables, markdown bold markers, or literal asterisks; Beckett formats headings separately.
${slackAgentToolInstruction(agentTool)}
${beckettBoundaryPrompt()}`;
  const userPrompt = [
    "The user has not connected a Beckett profile yet.",
    slackIntentInstruction(intent),
    "",
    "User request:",
    prompt,
    "",
    "Slack text available to Beckett:",
    cleanMessageText,
  ].join("\n");

  const text = await callAnthropic(system, [{ role: "user", content: userPrompt }], 420);
  return fitSlackAnswer(text.trim() || "I could not generate a response for that Slack request.", MAX_QUICK_SLACK_ANSWER_LENGTH);
}

export function handleSlackAiError(error: unknown) {
  if (error instanceof SlackGuestUsageLimitError) return error.message;

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

export function fitSlackAnswer(text: string, maxLength: number) {
  const cleaned = text
    .replace(/\n\n_Trimmed for Slack\._$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;

  const hardLimit = Math.max(200, maxLength - 3);
  const slice = cleaned.slice(0, hardLimit);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("\n")
  );
  const cutoff = sentenceEnd > hardLimit * 0.55 ? sentenceEnd + 1 : hardLimit;
  return `${cleaned.slice(0, cutoff).trim()}...`;
}
