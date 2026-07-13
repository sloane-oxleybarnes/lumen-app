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
const MAX_SLACK_CONTEXT_MESSAGES = 25;
const MAX_SLACK_CONTEXT_LENGTH = 7000;
const MAX_SLACK_BROAD_CONTEXT_LENGTH = 2600;
const MAX_SLACK_BROAD_CONTEXT_RESULTS = 12;
const MAX_SLACK_ASKED_PROMPT_LENGTH = 650;
const MAX_QUICK_SLACK_ANSWER_LENGTH = 650;
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
  "search:read",
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
  | "relationship"
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
  | "feature_not_enabled"
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
  relevantUserIds?: string[];
};

export function isCompactSlackIntent(intent: SlackCoachingIntent) {
  return intent === "decode" || intent === "respond" || intent === "rewrite" || intent === "relationship";
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
  reactions?: Array<{ name?: string; users?: string[]; count?: number }>;
};

export type SlackLatestMessageContext = {
  targetText: string;
  targetTs: string | null;
  context: SlackConversationContext;
};

type SlackUserInfo = {
  ok?: boolean;
  error?: string;
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
  messages?: unknown[] | { matches?: unknown[] };
  items?: unknown[];
};

type SlackLegacySearchResponse = {
  ok?: boolean;
  error?: string;
  messages?: { matches?: unknown[] };
};

type SlackSearchInfoResponse = {
  ok?: boolean;
  error?: string;
  is_ai_search_enabled?: boolean;
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

function slackUnavailable(reason: SlackContextFailureReason, retrievalMethod?: string): SlackConversationContext {
  return { text: null, status: "unavailable", failureReason: reason, messageCount: 0, retrievalMethod };
}

function slackContextFailureReasonForError(error?: string | null): SlackContextFailureReason {
  if (error === "missing_scope") return "missing_scope";
  if (error === "feature_not_enabled") return "feature_not_enabled";
  if (error === "not_in_channel") return "not_in_channel";
  if (error === "channel_not_found") return "channel_not_found";
  return "slack_api_error";
}

function normalizeSlackUserId(value: string | null | undefined) {
  const match = String(value || "").match(/\bU[A-Z0-9]{6,}\b/);
  return match?.[0] || null;
}

function uniqueSlackUserIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeSlackUserId).filter(Boolean) as string[]));
}

function slackUserIdsFromMessages(messages: Array<SlackHistoryMessage | undefined>) {
  return uniqueSlackUserIds(messages.map((message) => message?.user));
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
    /^(?:~\s*)?(?:possible read|next move|draft options|relationship read|what i['’]m basing this on|what is visible|visible facts|rewritten message|why this works|prep notes|talking points|opening sentence|likely pushback|follow-up draft|conversation goal|practice prompt|goal|say this first|if they push back|watch for|practice next|what works|try this version|direct but kind|warm and collaborative|concise)(?:\s*~)?\s*:?\s*$/i;
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
  if (normalized === "relationship read") return "Relationship read";
  if (normalized === "what i'm basing this on" || normalized === "what i’m basing this on") return "What I’m basing this on";
  if (normalized === "goal") return "Goal";
  if (normalized === "say this first") return "Say this first";
  if (normalized === "if they push back") return "If they push back";
  if (normalized === "watch for") return "Watch for";
  if (normalized === "practice next") return "Practice next";
  if (normalized === "what works") return "What works";
  if (normalized === "try this version") return "Try this version";
  if (normalized === "why it works") return "Why it works";
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
    .replace(/\bU[A-Z0-9]{8,}\b/g, "the Slack user")
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
    .replace(
      /^(Reply in this thread so I can keep this message, (?:read|drafts), and follow-ups saved together\.)$/gim,
      "*$1*"
    )
    .replace(/^(Possible read|Next move|Draft options|Relationship read|What I['’]m basing this on)\s*:?\s*$/gim, "*$1*")
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
  if (process.env.SLACK_GUEST_FULL_ACCESS === "true") return 999999;
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
    .gt("token_estimate", 0)
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
    case "relationship":
      return "You asked Beckett about:";
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
      return "Slack intent hint: The user likely wants editing or rewriting. Bias toward a rewritten version, but if their latest message asks a different question, answer that instead.";
    case "decode":
      return [
        "Slack intent hint: The user likely wants tone/subtext analysis. Bias toward a concise read, but if they ask for drafting, feedback assessment, prep, or something else, switch to that.",
        "For decode answers, use exactly these headings when they fit: Possible read and Next move.",
        "Keep decode answers short: 1-2 sentences under Possible read and 1-3 bullets or questions under Next move.",
        "Do not use separate headings like What's visible, What might be underneath, or What to pay attention to unless the user explicitly asks for a deeper breakdown.",
        "If a phrase is ambiguous, Next move should include concrete clarifying questions the user could ask.",
      ].join(" ");
    case "relationship":
      return "Slack intent hint: The user likely wants a broad relationship, history, vibe, pattern, or dynamic read. Do not force single-message decode language unless the user asks about one specific message.";
    case "draft":
      return "Slack intent hint: The user likely wants ready-to-use wording. Provide draft language when useful, but ask one focused question if the target or goal is genuinely unclear.";
    case "prep":
      return "Slack intent hint: The user likely wants difficult-conversation prep. Continue prep if that fits their latest message; switch if they correct the goal or ask for analysis/drafting instead.";
    case "tone":
      return "Slack intent hint: The user likely wants to know how wording may land. Identify tone risks and offer cleaner wording if useful.";
    case "followup":
      return "Slack intent hint: The user likely wants follow-up wording. Keep it specific, low-pressure, and clear about the next step.";
    case "respond":
      return "Slack intent hint: The user likely wants help responding. Bias toward a short read and Slack-ready draft options, but if their latest message asks for analysis, feedback assessment, or prep, answer that instead.";
    case "clarity":
      return "Slack intent hint: The user likely wants a clarity question. Identify missing information and draft a specific answerable question when useful.";
    case "boundary":
      return "Slack intent hint: The user likely wants boundary wording. Keep it firm, kind, specific, and realistic for Slack.";
    case "practice":
      return "Slack intent hint: The user likely wants practice. Start or continue role-play only if that matches their latest message.";
    default:
      return "Slack intent hint: General Beckett coaching. Answer the user's specific request directly.";
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
  const envBotToken =
    process.env.SLACK_BOT_TOKEN?.trim() ||
    process.env.SLACK_WORKSPACE_BOT_TOKEN?.trim() ||
    process.env.SLACK_APP_BOT_TOKEN?.trim() ||
    null;

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
  return typeof metadata.access_token === "string" ? metadata.access_token : envBotToken;
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
        title: "Decode a Selected Message",
        message: "Help me decode a Slack message.",
      },
      {
        title: "Respond to a Selected Message",
        message: "Help me draft a response to a Slack message.",
      },
      {
        title: "Edit a Draft",
        message: "Help me rewrite a draft.",
      },
      {
        title: "Prep",
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

function extractSearchPermalink(result: unknown) {
  if (!result || typeof result !== "object") return "";
  return pickString(result, ["permalink"]);
}

function getSearchResults(data: SlackSearchContextResponse | null) {
  if (!data?.ok) return [];
  if (Array.isArray(data.messages)) return data.messages;
  if (data.results && !Array.isArray(data.results) && Array.isArray(data.results.messages)) return data.results.messages;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.matches)) return data.matches;
  if (data.messages && !Array.isArray(data.messages) && Array.isArray(data.messages.matches)) return data.messages.matches;
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

function isRelationshipHistoryPrompt(prompt: string) {
  return /\b(relationship|history|pattern|vibe|dynamic|overall|usually|typically|how are things with|where.*stand|what.*between us|context with)\b/i.test(prompt);
}

const SLACK_RELATIONSHIP_LIMITATION_NOTE =
  "I’m working from the visible conversation I could access here. Full Slack history search is coming soon, so relationship insights may be limited for now.";

function slackNoContextPromptInstruction({
  intent,
  contextFailureReason,
}: {
  intent: SlackCoachingIntent;
  contextFailureReason?: SlackContextFailureReason | null;
}) {
  if (intent === "relationship") {
    switch (contextFailureReason) {
      case "feature_not_enabled":
        return [
          "No Slack relationship context was available.",
          "Say that you tried full Slack history search, but Real-Time Search is not enabled for this workspace/app yet.",
          "Ask the user to send a Slack message link or use Beckett - Decode / Beckett - Respond on a relevant message so you can answer from visible context.",
          "Do not ask for an exact single message as if this were a decode request.",
        ].join(" ");
      case "no_messages":
        return [
          "No Slack relationship context was available.",
          "Say that you tried Slack history search, but it did not return usable messages for this question.",
          "Ask the user to send a Slack message link or use Beckett - Decode / Beckett - Respond on a relevant message so you can answer from visible context.",
          "Do not ask for an exact single message as if this were a decode request.",
        ].join(" ");
      case "missing_scope":
        return [
          "No Slack relationship context was available.",
          "Say that you are missing the Slack permissions needed to search the relevant history.",
          "Tell the user to reconnect Slack from Beckett Settings, then reinstall or reauthorize the Slack app if prompted.",
        ].join(" ");
      case "missing_token":
        return "No Slack relationship context was available. Say Slack is not connected for this account and ask the user to connect Slack from Beckett Settings.";
      default:
        return [
          "No Slack relationship context was available.",
          "Say that you could not find readable Slack context for this relationship question.",
          "Ask the user to send a Slack message link or use Beckett - Decode / Beckett - Respond on a relevant message so you can answer from visible context.",
        ].join(" ");
    }
  }

  if (isCompactSlackIntent(intent)) {
    return "No recent Slack context was available. If the user did not provide message text, say exactly: I could not read this Slack conversation. Paste or paraphrase the message and I’ll help.";
  }

  return "No recent Slack context was available. Answer from the user's request without implying you saw surrounding messages.";
}

function buildTargetedBroaderSearchQuery({
  prompt,
  activeContext,
  slackUserId,
}: {
  prompt: string;
  activeContext?: string | null;
  slackUserId: string;
}) {
  const base = buildBroaderSearchQuery(prompt, activeContext);
  return `with:<@${slackUserId}> ${base}`.trim();
}

export async function lookupSlackUserProfile(accessToken: string, userId: string) {
  const cacheKey = `${accessToken.slice(-8)}:${userId}`;
  const cached = slackUserNameCache.get(cacheKey);
  if (cached) return { id: userId, name: cached, aliases: [cached], resolved: cached !== "Slack user" };

  const data = await slackApiFetch<SlackUserInfo>(
    accessToken,
    "users.info",
    new URLSearchParams({ user: userId })
  ).catch(() => null);
  const resolvedName =
    data?.user?.profile?.display_name ||
    data?.user?.profile?.real_name ||
    data?.user?.real_name ||
    data?.user?.name ||
    "";
  const name = resolvedName && !/^U[A-Z0-9]+$/i.test(resolvedName) ? resolvedName : "Slack user";
  const aliases = Array.from(
    new Set(
      [
        data?.user?.profile?.display_name,
        data?.user?.profile?.real_name,
        data?.user?.real_name,
        data?.user?.name,
        resolvedName,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  slackUserNameCache.set(cacheKey, name);
  if (!resolvedName) {
    console.warn("Slack user profile name unavailable", {
      userPresent: Boolean(userId),
      error: data?.error || "missing_profile_name",
    });
  }
  return { id: data?.user?.id || userId, name, aliases, resolved: Boolean(resolvedName) };
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

  const reactions = await Promise.all((message.reactions || []).map(async (reaction) => {
    const names = await Promise.all((reaction.users || []).slice(0, 8).map((userId) => lookupSlackUserName(accessToken, userId)));
    const label = reaction.name ? `:${reaction.name}:` : "reaction";
    if (names.length) return `${label} from ${names.join(", ")}`;
    return `${label} ×${reaction.count || 1}`;
  }));
  return `${author}: ${text}${reactions.length ? ` [Reactions: ${reactions.join("; ")}]` : ""}`;
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
  const relevantUserIds = uniqueSlackUserIds([
    ...slackUserIdsFromMessages(historyData?.messages || []),
    ...slackUserIdsFromMessages(replyData?.messages || []),
    ...slackUserIdsFromMessages(fallbackReplyData?.messages || []),
  ]);

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
    relevantUserIds,
  } satisfies SlackConversationContext;
}

export async function fetchLatestSlackMessageContext({
  accessToken,
  channelId,
  channelName,
  currentSlackUserId,
}: {
  accessToken: string | null;
  channelId?: string | null;
  channelName?: string | null;
  currentSlackUserId?: string | null;
}): Promise<SlackLatestMessageContext | null> {
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

  if (!data?.ok || !Array.isArray(data.messages) || !data.messages.length) return null;
  const currentUserId = normalizeSlackUserId(currentSlackUserId);
  const target = data.messages.find((message) => {
    if (!message?.text || message.bot_id || message.subtype) return false;
    if (currentUserId && message.user === currentUserId) return false;
    return Boolean(stripSlackMarkup(message.text).trim());
  }) || data.messages.find((message) => message?.text && !message.bot_id && !message.subtype);

  if (!target?.text) return null;

  const context = await fetchSlackConversationContext({
    accessToken,
    channelId,
    channelName,
    messageTs: target.ts,
    threadTs: target.thread_ts,
  });

  return {
    targetText: stripSlackMarkup(target.text),
    targetTs: target.ts || null,
    context,
  };
}

export async function buildGuestSlackContextPacket({
  botAccessToken,
  channelId,
  channelName,
  selectedMessageText,
  selectedMessageTs,
  threadTs,
  latestMessageText,
  currentSlackUserId,
  userRequest,
}: {
  botAccessToken: string | null;
  channelId?: string | null;
  channelName?: string | null;
  selectedMessageText?: string | null;
  selectedMessageTs?: string | null;
  threadTs?: string | null;
  latestMessageText?: string | null;
  currentSlackUserId?: string | null;
  userRequest?: string | null;
}) {
  const sections: string[] = [];
  const selected = selectedMessageText?.trim();
  const latest = latestMessageText?.trim();
  const request = userRequest?.trim();
  if (selected) sections.push(["Selected Slack message:", selected].join("\n"));
  if (!selected && latest) sections.push(["Target latest Slack message:", latest].join("\n"));
  if (request) sections.push(["User request:", request].join("\n"));

  let context: SlackConversationContext | null = null;
  if (botAccessToken && channelId) {
    context = selectedMessageTs || threadTs
      ? await fetchSlackConversationContext({
          accessToken: botAccessToken,
          channelId,
          channelName,
          messageTs: selectedMessageTs,
          threadTs,
        })
      : (await fetchLatestSlackMessageContext({
          accessToken: botAccessToken,
          channelId,
          channelName,
          currentSlackUserId,
        }))?.context || await fetchSlackConversationContext({
          accessToken: botAccessToken,
          channelId,
          channelName,
        });
  }

  if (context?.text) sections.push(["Surrounding Slack context:", context.text].join("\n"));
  else if (selected || latest) {
    sections.push("I’m working from the message I could see because I couldn’t read the surrounding conversation.");
  }

  return {
    text: sections.filter(Boolean).join("\n\n"),
    context,
    messageCount: context?.messageCount || 0,
    contextStatus: context?.status || (selected || latest || request ? "available" : "unavailable"),
    contextFailureReason: context?.failureReason || null,
  };
}

async function runSlackBroaderSearch({
  accessToken,
  query,
  contextChannelId,
  actionToken,
  strategy,
}: {
  accessToken: string;
  query: string;
  contextChannelId?: string | null;
  actionToken?: string | null;
  strategy: string;
}) {
  const body: Record<string, unknown> = {
    query,
    content_types: ["messages"],
    channel_types: ["public_channel", "private_channel", "mpim", "im"],
    include_context_messages: true,
    limit: MAX_SLACK_BROAD_CONTEXT_RESULTS,
  };
  if (contextChannelId) body.context_channel_id = contextChannelId;
  if (actionToken) body.action_token = actionToken;

  const data = await slackApiPost<SlackSearchContextResponse>(accessToken, "assistant.search.context", body).catch(
    () => null
  );
  const method = `assistant.search.context ${strategy}`;
  if (!data?.ok) {
    console.warn("Slack RTS search.context unavailable", {
      strategy,
      error: data?.error || "request_failed",
      contextChannelPresent: Boolean(contextChannelId),
      actionTokenPresent: Boolean(actionToken),
    });
    return slackUnavailable(
      slackContextFailureReasonForError(data?.error),
      `${method}${data?.error ? ` error:${data.error}` : " request_failed"}`
    );
  }

  const results = getSearchResults(data);
  console.info("Slack RTS search.context result", {
    ok: true,
    strategy,
    resultCount: results.length,
    contextChannelPresent: Boolean(contextChannelId),
    actionTokenPresent: Boolean(actionToken),
  });
  if (!results.length) return slackUnavailable("no_messages", `${method} no_results`);

  const formatted = results
    .map((result) => {
      const text = compactText(extractSearchText(result), 380);
      if (!text) return null;
      return `${extractSearchLabel(result)}: ${text}`;
    })
    .filter(Boolean)
    .slice(0, MAX_SLACK_BROAD_CONTEXT_RESULTS) as string[];

  if (!formatted.length) return slackUnavailable("no_messages", `${method} parser_empty`);

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
    retrievalMethod: method,
  } satisfies SlackConversationContext;
}

async function runLegacySlackMessageSearch({
  accessToken,
  query,
}: {
  accessToken: string;
  query: string;
}) {
  const data = await slackApiFetch<SlackLegacySearchResponse>(
    accessToken,
    "search.messages",
    new URLSearchParams({ query, count: String(MAX_SLACK_BROAD_CONTEXT_RESULTS), sort: "score" })
  ).catch(() => null);
  const method = "search.messages fallback";
  if (!data?.ok) {
    console.warn("Slack message search fallback unavailable", {
      error: data?.error || "request_failed",
    });
    return slackUnavailable(slackContextFailureReasonForError(data?.error), `${method} error:${data?.error || "request_failed"}`);
  }

  const results = Array.isArray(data.messages?.matches) ? data.messages.matches : [];
  const formatted = results
    .map((result) => {
      const text = compactText(extractSearchText(result), 380);
      if (!text) return null;
      const permalink = extractSearchPermalink(result);
      return `${extractSearchLabel(result)}: ${text}${permalink ? ` (${permalink})` : ""}`;
    })
    .filter(Boolean)
    .slice(0, MAX_SLACK_BROAD_CONTEXT_RESULTS) as string[];
  if (!formatted.length) return slackUnavailable("no_messages", `${method} no_results`);

  const context = ["Relevant prior Slack history from live search:", ...formatted].join("\n");
  return {
    text: context.length <= MAX_SLACK_BROAD_CONTEXT_LENGTH
      ? context
      : `${context.slice(0, MAX_SLACK_BROAD_CONTEXT_LENGTH - 40).trim()}\n[Broader context trimmed]`,
    status: "available",
    failureReason: null,
    messageCount: formatted.length,
    broaderSearchUsed: true,
    retrievalMethod: method,
  } satisfies SlackConversationContext;
}

async function fetchSlackRealTimeSearchInfo(accessToken: string | null) {
  if (!accessToken) {
    return {
      ok: false,
      available: false,
      error: "missing_token",
      isAiSearchEnabled: false,
    };
  }

  const data = await slackApiPost<SlackSearchInfoResponse>(accessToken, "assistant.search.info", {}).catch(
    (error) => {
      console.error("Slack RTS search.info request failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  );
  const info = {
    ok: Boolean(data?.ok),
    available: Boolean(data?.ok),
    error: data?.error || null,
    isAiSearchEnabled: Boolean(data?.is_ai_search_enabled),
  };
  console.info("Slack RTS search.info", info);
  return info;
}

export async function fetchSlackBroaderContext({
  accessToken,
  prompt,
  activeContext,
  contextChannelId,
  actionToken,
  relevantSlackUserIds = [],
  currentSlackUserId,
}: {
  accessToken: string | null;
  prompt: string;
  activeContext?: string | null;
  contextChannelId?: string | null;
  actionToken?: string | null;
  relevantSlackUserIds?: string[];
  currentSlackUserId?: string | null;
}) {
  if (!accessToken) return slackUnavailable("missing_token");

  const rtsInfo = await fetchSlackRealTimeSearchInfo(accessToken);
  if (!rtsInfo.available) {
    const unavailable = slackUnavailable(
      slackContextFailureReasonForError(rtsInfo.error),
      `assistant.search.info error:${rtsInfo.error || "unavailable"}`
    );
    if (unavailable.failureReason === "feature_not_enabled") {
      const fallback = await runLegacySlackMessageSearch({
        accessToken,
        query: buildBroaderSearchQuery(prompt, activeContext),
      });
      if (fallback.status === "available") return fallback;
      unavailable.retrievalMethod = [unavailable.retrievalMethod, fallback.retrievalMethod].filter(Boolean).join("; ");
    }
    return unavailable;
  }

  const normalizedUserIds = uniqueSlackUserIds(relevantSlackUserIds);
  const currentUserId = normalizeSlackUserId(currentSlackUserId);
  const orderedUserIds =
    currentUserId && normalizedUserIds.some((id) => id !== currentUserId)
      ? [...normalizedUserIds.filter((id) => id !== currentUserId), currentUserId]
      : normalizedUserIds;
  const relationshipSearch = isRelationshipHistoryPrompt(prompt);
  const attempted: string[] = [];
  let firstFailure: SlackConversationContext | null = null;
  if (relationshipSearch && orderedUserIds.length) {
    for (const userId of orderedUserIds.slice(0, 3)) {
      const targeted = await runSlackBroaderSearch({
        accessToken,
        query: buildTargetedBroaderSearchQuery({ prompt, activeContext, slackUserId: userId }),
        contextChannelId,
        actionToken,
        strategy: `with:<@${userId}>`,
      });
      if (targeted.status === "available") return targeted;
      attempted.push(targeted.retrievalMethod || `assistant.search.context with:<@${userId}>`);
      firstFailure ||= targeted;
      if (targeted.failureReason === "missing_scope") {
        return targeted;
      }
    }
  }

  const generic = await runSlackBroaderSearch({
    accessToken,
    query: buildBroaderSearchQuery(prompt, activeContext),
    contextChannelId,
    actionToken,
    strategy: relationshipSearch && orderedUserIds.length ? "generic_fallback" : "generic",
  });
  if (generic.status === "available") return generic;
  if (generic.failureReason === "feature_not_enabled" || generic.failureReason === "no_messages") {
    const fallback = await runLegacySlackMessageSearch({
      accessToken,
      query: buildBroaderSearchQuery(prompt, activeContext),
    });
    if (fallback.status === "available") return fallback;
    generic.retrievalMethod = [generic.retrievalMethod, fallback.retrievalMethod].filter(Boolean).join("; ");
  }
  if (attempted.length) {
    return slackUnavailable(
      generic.failureReason || firstFailure?.failureReason || "no_messages",
      [...attempted, generic.retrievalMethod || "assistant.search.context generic"].join("; ")
    );
  }

  return generic;
}

export async function buildSlackCoachingContext({
  user,
  prompt,
  activeContext,
  contextChannelId,
  actionToken,
  includeBroaderContext = true,
  relevantSlackUserIds = [],
  currentSlackUserId,
}: {
  user: SlackConnectedUser;
  prompt: string;
  activeContext?: SlackConversationContext | null;
  contextChannelId?: string | null;
  actionToken?: string | null;
  includeBroaderContext?: boolean;
  relevantSlackUserIds?: string[];
  currentSlackUserId?: string | null;
}) {
  const broaderContext = includeBroaderContext
    ? await fetchSlackBroaderContext({
        accessToken: user.accessToken,
        prompt,
        activeContext: activeContext?.text,
        contextChannelId,
        actionToken,
        relevantSlackUserIds: uniqueSlackUserIds([
          ...(activeContext?.relevantUserIds || []),
          ...relevantSlackUserIds,
        ]),
        currentSlackUserId,
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
      return "How to resolve: I’m missing the Slack permissions needed to read this context. Reconnect Slack from Beckett Settings, then reinstall or reauthorize the Slack app if prompted.";
    case "feature_not_enabled":
      return "How to resolve: Slack broader search is not enabled for this app or workspace yet. I can still use the active conversation and linked Slack threads.";
    case "not_in_channel":
      return "How to resolve: I do not have access to this channel or DM. Add Beckett to the channel or use a conversation Beckett is authorized to read.";
    case "channel_not_found":
      return "How to resolve: I could not find that Slack channel or conversation. Check that the link is from the connected workspace.";
    case "no_messages":
      return "How to resolve: I could open the conversation, but Slack did not return readable messages. Try linking a specific message or thread.";
    case "missing_token":
      return "How to resolve: Slack is not connected for this account. Connect Slack from Beckett Settings.";
    default:
      return "How to resolve: Slack returned an error while I was trying to read context. Try again, or reconnect Slack if this keeps happening.";
  }
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
  const isRelationshipRequest = isRelationshipHistoryPrompt(prompt);
  const shouldShowRelationshipLimitation =
    isRelationshipRequest && contextStatus === "available" && !broaderSearchUsed;

  const system = `You are Beckett, a workplace and workplace-adjacent communication coach for neurodivergent professionals.
	You are responding inside Slack, so be concise, practical, and easy to scan.
	The Slack-authenticated requester is ${user.name || "a connected Beckett user"}. If asked who the requester is, use this identity and never claim that you cannot access it.
	Slack has already authenticated the requester separately from people they tag. Treat a tagged third party as the other person, never ask whether the requester is that tagged person, and never expose Slack user or team IDs.
Help the user understand tone, subtext, context, next steps, and possible replies across workplace, workplace-adjacent, friendly, and personal Slack conversations.
Slack flow labels are hints, not rules. Always respond to the user's latest actual request, even if it means switching from decode to drafting, from respond to feedback analysis, from prep to a direct answer, or from a guided flow to one focused clarifying question.
Every response should be generated from the user's current message plus available context. Do not sound like a fixed template. Use the suggested section shapes only when they genuinely fit.
Choose the most useful next move yourself: answer directly, decode, draft, rewrite, prep, practice, assess feedback, or ask one focused clarifying question. Do not ask multiple setup questions at once.
If the user gives a usable scenario but not exact wording, help from the scenario and briefly note any uncertainty instead of blocking.
Do not refuse just because the Slack context is personal, casual, friendly, or not strictly work-related. If the user asks for help responding, decoding, or rewriting, help with the conversation they provided.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Do not hallucinate reactions, comfort, rapport, agreement, annoyance, or pushback that is not visible in the provided Slack text.
Always separate "what is visible" from "possible interpretation" when decoding a Slack message or thread.
When broader Slack history is included, clearly distinguish active-thread facts from relevant prior history. Prior history can shape preparation, but it does not prove current intent.
When the user asks Slack search to recall a decision, date, owner, status, or other fact, answer in at most two sentences under 50 words. State the result and its source. Do not comment on how often the requester asked, their search behavior, or unrelated Beckett DM history.
When active Slack context is available, answer from that visible conversation first. Do not ask broad relationship-history or background questions unless the user explicitly asks for a broad relationship assessment.
If the user asks for relationship insight and active Slack context is available, give a limited read based on that visible context instead of saying there is nothing to assess. State the limitation briefly if broader history is unavailable.
For broad relationship, history, pattern, vibe, or dynamic questions where broader Slack history is unavailable but visible context is available, start the answer from the visible thread with phrasing like "Based on the visible conversation..." and do not ask for more background unless there is no visible Slack context.
If active Slack context is available but broader Slack history or saved relationship context is missing, do not treat that as a blocker. Mention it only briefly when relevant.
Do not say you cannot access DMs, direct messages, private channels, or Slack history as a general capability claim. You may only describe the specific Slack context status provided in the prompt, such as missing permissions, not in channel, no messages found, or linked context available.
Do not explain Slack retrieval failures in your own words. Answer only from the Slack context and user text actually provided.
If Slack context is unavailable for a prep request, continue coaching from the user's stated scenario instead of saying you need the actual pattern first.
If the user is over-reading an ambiguous message, fold what is uncertain or not knowable into the Possible read section in one concise sentence.
Avoid generic encouragement. Give concrete language the user could use.
Format with short plain-language section labels and bullets. Do not use markdown tables, markdown bold markers, or literal asterisks; Beckett formats headings separately.
For decode/respond work, prefer these section labels when they fit: Possible read, Next move, Draft options. If they do not fit the user's actual question, choose clearer labels.
Never include a standalone "What's not knowable", "What is not knowable", "What isn't knowable", or "What not to over-read" section.
For preparation work, prefer short coach-card sections when they fit: Goal, Say this first, If they push back, Watch for, Practice next.
Do not repeat the user's request at the top of the answer; Beckett will add that outside the AI response.
For reply drafting, include 2-3 Slack-ready bullet options when useful: - Direct but kind, - Warm and collaborative, and - Concise.
For low-stakes social messages with clear visible context, draft useful options immediately. Do not ask about relationship, channel vibe, and desired tone when reasonable defaults are already visible.
During an active Respond task, additional context refines the existing drafts. Do not ask what kind of help the user wants, offer a menu of other Beckett modes, or ask for the selected message again when it is present in context.
When the user asks to shorten or revise a named draft option, revise only that option and preserve the original selected-message context.
	For Rewrite, do not restate the user's draft or request before the answer. Start directly with “Here are three options:” when offering variants. Preserve the original meaning and boundary, apply the requested tone change, and make the options meaningfully different rather than near-duplicates.
	For Decode, lead with a short likely read, then concise visible evidence, one or two possible interpretations, and a practical next step. Always name ambiguity or an alternative interpretation; never present inferred intent as fact. Use visible reactions and surrounding channel context when provided. Avoid walls of text.
	For compact Slack flows, use no more than 75 words and no more than 5 nonblank lines. For final Prep assessments, return exactly three nonblank lines—Goal, Say this first, and If they push back—using no more than 45 words total. Never omit the pushback line.
For difficult conversation prep, keep the answer focused on the goal, first sentence, likely pushback, what to watch for, and one next practice step.
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
      ? "Response length: Quick answer. Keep it concise: 2-4 practical bullets, plus suggested wording only if useful. Keep the complete answer under 500 characters."
      : responseDetail === "longer"
        ? "Response length: Longer explanation. Give more context about likely tone/subtext, what to watch for, next steps, and suggested wording. Keep it scannable in Slack and under 1700 characters."
        : "Response length: Default Slack coaching response. Be concise but useful.";
  const contextLine = contextStatus
    ? `Slack context status: ${contextStatus}${contextFailureReason ? ` (${contextFailureReason})` : ""}. Broader Slack search used: ${broaderSearchUsed ? "yes" : "no"}.`
    : "";
  const relationshipLimitationLine = shouldShowRelationshipLimitation
    ? `Relationship insight limitation: ${SLACK_RELATIONSHIP_LIMITATION_NOTE}`
    : "";
  const messageLine = messageText
    ? `\n\nSlack context packet:\n${messageText}`
    : contextStatus === "unavailable"
      ? `\n\n${slackNoContextPromptInstruction({ intent, contextFailureReason })}`
      : "";
  const relationshipLine = relationshipContext
    ? `\n\nConfirmed relationship context:\n${relationshipContext}`
    : "";
  const userPrompt = `Requester identity: ${user.name || "connected Slack user"}.
${coachingProfileContext || "The user has not set specific Beckett coaching preferences yet."}
${responseDetailLine}
${contextLine}
${relationshipLimitationLine}
${slackIntentInstruction(intent)}

User request:
${prompt}${relationshipLine}${messageLine}`;

  const maxTokens = responseDetail === "longer" ? 700 : responseDetail === "quick" ? 240 : 800;
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

  const withRelationshipLimitation =
    shouldShowRelationshipLimitation && !text.includes(SLACK_RELATIONSHIP_LIMITATION_NOTE)
      ? `${text.trim()}\n\n${SLACK_RELATIONSHIP_LIMITATION_NOTE}`
      : text;
  const cleaned = withRelationshipLimitation.trim() || "I could not generate a response for that Slack request.";
  if (broaderSearchUsed && intent === "general") {
    return fitSlackAnswer(compactSlackResponseLayout(cleaned), 320);
  }
  if (responseDetail === "quick") return fitSlackAnswer(compactSlackResponseLayout(cleaned), compactSlackLimit(intent));
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
The Slack user is using guest mode. You do not have their Beckett coaching profile, contact memory, or saved Beckett history. Use live Slack search results only when they are explicitly included in the available Slack text, and never imply access to anything that was not returned there.
Slack has already authenticated the requester separately from people they tag. Treat a different tagged Slack user as the other person, never ask whether the requester is that tagged person, and never expose Slack user or team IDs.
Slack flow labels are hints, not rules. Always respond to the user's latest actual request, even if it means switching from decode to drafting, from respond to feedback analysis, from prep to a direct answer, or from a guided flow to one focused clarifying question.
Every response should be generated from the user's current message plus available Slack text. Do not sound like a fixed template. Use section shapes only when they genuinely fit.
Choose the most useful next move yourself: answer directly, decode, draft, rewrite, prep, practice, assess feedback, or ask one focused clarifying question. Do not ask multiple setup questions at once.
If the user gives a usable scenario but not exact wording, help from the scenario and briefly note any uncertainty instead of blocking.
Help with workplace, workplace-adjacent, friendly, logistics, and personal Slack conversations when the user asks for decode, respond, rewrite, prep, or practice help.
Do not refuse because a message is personal or casual.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Do not hallucinate reactions, comfort, rapport, agreement, annoyance, or pushback that is not visible in the provided Slack text.
Always separate visible facts from possible interpretation when decoding.
Fold what is uncertain or not knowable into the Possible read section in one concise sentence; never include a standalone "What's not knowable", "What is not knowable", "What isn't knowable", or "What not to over-read" section.
If there is not enough text to analyze, ask the user to paste or paraphrase the message.
For reply drafting, include 2-3 Slack-ready bullet options when useful: - Direct but kind, - Warm and collaborative, and - Concise.
For low-stakes social messages with clear visible context, draft useful options immediately. Do not ask about relationship, channel vibe, and desired tone when reasonable defaults are already visible.
During an active Respond task, additional context refines the existing drafts. Do not ask what kind of help the user wants, offer a menu of other Beckett modes, or ask for the selected message again when it is present in context.
When the user asks to shorten or revise a named draft option, revise only that option and preserve the original selected-message context.
For Rewrite, do not restate the user's draft or request before the answer. Start directly with “Here are three options:” when offering variants. Preserve the original meaning and boundary, apply the requested tone change, and make the options meaningfully different rather than near-duplicates.
For Decode, lead with a short likely read, then concise visible evidence, one or two possible interpretations, and a practical next step. Use visible reactions and surrounding channel context when provided. Avoid walls of text.
For prep or practice, give a useful lightweight coaching response from the user request without asking them to connect a Beckett profile.
For prep, enforce this guided order inside the exact Slack thread: person and situation, conversation location or medium, desired outcome, concern or likely pushback, then concise final prep. Infer and skip the location question when the user already clearly says Slack/written message, video/phone call, or in person. Ask only the earliest unanswered question. If the user directly requests intros, drafts, or another concrete deliverable, answer that request immediately using the thread context.
For final prep, tailor the advice to the conversation medium and use only concise sections that help: Goal, Say this first, If they push back. Do not recap the whole conversation, give a long menu, repeat information the user already supplied, or ask which portion they want to practice.
For practice, start with a short setup and one realistic first line only when the Slack thread does not show that role-play has already started.
When the Slack thread shows an active role-play, continue in character with one concise turn. Do not restart setup, summarize prior prep, or ask what the user wants to focus on unless they explicitly request coaching.
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
  return fitSlackAnswer(
    text.trim() || "I could not generate a response for that Slack request.",
    intent === "practice" ? 800 : intent === "prep" ? 1200 : MAX_QUICK_SLACK_ANSWER_LENGTH
  );
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

function compactSlackLimit(intent: SlackCoachingIntent) {
  if (intent === "practice") return 420;
  if (intent === "decode" || intent === "relationship") return 500;
  if (intent === "rewrite" || intent === "respond") return 540;
  if (intent === "prep") return 390;
  return MAX_QUICK_SLACK_ANSWER_LENGTH;
}

function compactSlackResponseLayout(text: string) {
  const lines = text.split("\n");
  const compact: string[] = [];
  const heading = /^(?:~\s*)?(Possible read|Next move|Goal|Say this first|If they push back)(?:\s*~)?\s*:?$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index].trim();
    if (!current) continue;
    const match = current.match(heading);
    if (!match) {
      compact.push(current);
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
    const next = lines[nextIndex]?.trim();
    if (next && !heading.test(next)) {
      compact.push(`~ ${match[1]} ~ ${next.replace(/^[-•]\s*/, "")}`);
      index = nextIndex;
    } else {
      compact.push(`~ ${match[1]} ~`);
    }
  }

  return compact.join("\n");
}
