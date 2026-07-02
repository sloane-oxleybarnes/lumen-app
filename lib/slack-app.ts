import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { trackBetaEvent } from "@/lib/beta-events";
import { beckettBoundaryPrompt } from "@/lib/beckett-boundaries";
import { formatCoachingProfileForPrompt } from "@/lib/coaching-profile";
import { getPublicSiteUrl } from "@/lib/deployment-env";
import { supabaseAdmin } from "@/lib/server-admin";
import { selectSlackAgentTool, slackAgentToolInstruction } from "@/lib/slack-agent-tools";

const MAX_SLACK_TEXT_LENGTH = 2800;
const MAX_SLACK_CONTEXT_MESSAGES = 8;
const MAX_SLACK_CONTEXT_LENGTH = 2600;
const MAX_SLACK_ASKED_PROMPT_LENGTH = 650;
const MAX_QUICK_SLACK_ANSWER_LENGTH = 1200;
const MAX_LONGER_SLACK_ANSWER_LENGTH = 2000;
export const SLACK_SLASH_QUICK_ACTION_ID = "beckett_slash_quick";
export const SLACK_SLASH_LONGER_ACTION_ID = "beckett_slash_longer";
export const REQUIRED_SLACK_USER_SCOPES = ["channels:history", "groups:history", "im:history", "mpim:history", "users:read"];

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
};

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
  const header = [`*${slackAskedLabel(intent)}*`, `>${formatAskedPrompt(prompt)}`, ""].join("\n");
  const availableAnswerLength = Math.max(800, MAX_SLACK_TEXT_LENGTH - header.length - 2);
  return `${header}\n${fitSlackAnswer(response, availableAnswerLength)}`;
}

function slackIntentInstruction(intent: SlackCoachingIntent) {
  switch (intent) {
    case "rewrite":
      return "Slack task: Rewrite or improve the user's draft. Preserve the meaning, make it natural for workplace Slack/email, and briefly explain the main tone choice.";
    case "decode":
      return "Slack task: Decode the pasted message or recent context. Explain likely tone/subtext as possibilities, what to pay attention to, and a useful next move.";
    case "draft":
      return "Slack task: Draft a message from the user's goal. Provide ready-to-use wording and briefly name any assumptions.";
    case "prep":
      return "Slack task: Help the user prepare for a workplace conversation. Cover how to start, how it might go, likely pushback, and what to watch for.";
    case "tone":
      return "Slack task: Check how the wording may land. Identify tone risks, then offer a cleaner version if useful.";
    case "followup":
      return "Slack task: Help write or improve a follow-up. Keep it specific, low-pressure, and clear about the next step.";
    case "respond":
      return "Slack task: Help the user respond to the Slack context. Explain the strategy briefly, then provide 2-3 ready-to-use reply options labeled Direct but kind, Warm and collaborative, and Concise.";
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

export async function postSlackAgentMessage({
  botAccessToken,
  slackUserId,
  text,
  title,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  text: string;
  title: string;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };

  const opened = await slackApiPost<{ channel?: { id?: string } }>(botAccessToken, "conversations.open", {
    users: slackUserId,
  });
  const channelId = opened.channel?.id;
  if (!opened.ok || !channelId) return { ok: false, error: opened.error || "dm_open_failed" };

  const posted = await slackApiPost<{ ts?: string }>(botAccessToken, "chat.postMessage", {
    channel: channelId,
    text: truncateSlackText(text),
  });
  if (!posted.ok || !posted.ts) return { ok: false, error: posted.error || "agent_post_failed" };

  await slackApiPost(botAccessToken, "assistant.threads.setTitle", {
    channel_id: channelId,
    thread_ts: posted.ts,
    title: title.slice(0, 80),
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

  const fetchRecentHistory = () =>
    slackApiFetch<{ messages?: SlackHistoryMessage[] }>(
      accessToken,
      "conversations.history",
      new URLSearchParams({
        channel: channelId,
        limit: String(MAX_SLACK_CONTEXT_MESSAGES),
        inclusive: "true",
      })
    ).catch(() => null);

  const replyTs = threadTs || messageTs || null;
  const replyData = replyTs
    ? await slackApiFetch<{ messages?: SlackHistoryMessage[] }>(
        accessToken,
        "conversations.replies",
        new URLSearchParams({
          channel: channelId,
          ts: replyTs,
          limit: String(MAX_SLACK_CONTEXT_MESSAGES),
          inclusive: "true",
        })
      ).catch(() => null)
    : null;
  const data = replyData?.ok ? replyData : await fetchRecentHistory();

  if (!data?.ok) {
    const reason =
      data?.error === "missing_scope"
        ? "missing_scope"
        : data?.error === "not_in_channel"
          ? "not_in_channel"
          : data?.error === "channel_not_found"
            ? "channel_not_found"
            : "slack_api_error";
    return slackUnavailable(reason);
  }
  if (!Array.isArray(data.messages) || data.messages.length === 0) return slackUnavailable("no_messages");

  const formatted = (
    await Promise.all(data.messages.slice().reverse().map((message) => formatSlackHistoryMessage(accessToken, message)))
  ).filter(Boolean) as string[];

  if (!formatted.length) return slackUnavailable("no_messages");

  const label = channelName ? `#${channelName}` : "this Slack conversation";
  const contextLabel = replyData?.ok ? `Slack thread context from ${label}` : `Recent Slack context from ${label}`;
  const context = [`${contextLabel} (oldest to newest):`, ...formatted].join("\n");
  return {
    text:
      context.length <= MAX_SLACK_CONTEXT_LENGTH
        ? context
        : `${context.slice(0, MAX_SLACK_CONTEXT_LENGTH - 40).trim()}\n[Context trimmed]`,
    status: "available",
    failureReason: null,
    messageCount: formatted.length,
  } satisfies SlackConversationContext;
}

export function slackContextUserNote(context: SlackConversationContext) {
  if (context.status === "available") return "";
  switch (context.failureReason) {
    case "missing_scope":
      return "_I could not read recent Slack context because this Slack connection is missing the newest private-channel permissions. Reconnect Slack from Beckett Settings when you want private-channel context included._";
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

export async function runSlackCoaching({
  user,
  action,
  prompt,
  sourceLabel,
  messageText,
  contextStatus,
  contextFailureReason,
  contextMessageCount,
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
      responseDetail: responseDetail || null,
      intent,
      agentTool: selectSlackAgentTool({
        intent,
        action,
        hasSlackContext: Boolean(messageText || contextStatus === "available"),
      }),
    },
  });

  const agentTool = selectSlackAgentTool({
    intent,
    action,
    hasSlackContext: Boolean(messageText || contextStatus === "available"),
  });

  const system = `You are Beckett, a workplace and workplace-adjacent communication coach for neurodivergent professionals.
You are responding inside Slack, so be concise, practical, and easy to scan.
Help the user understand tone, subtext, context, next steps, and possible replies.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Do not hallucinate reactions, comfort, rapport, agreement, annoyance, or pushback that is not visible in the provided Slack text.
Always separate "what is visible" from "possible interpretation" when decoding a Slack message or thread.
If the user is over-reading an ambiguous message, say what is not knowable from the thread.
Avoid generic encouragement. Give concrete language the user could use.
Format with short headings and bullets. Do not use markdown tables.
Do not repeat the user's request at the top of the answer; Beckett will add that outside the AI response.
For reply drafting, include 2-3 Slack-ready options when useful: Direct but kind, Warm and collaborative, and Concise.
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
      ? "Response length: Quick answer. Keep it concise: 2-4 practical bullets, plus suggested wording only if useful. Keep the answer under 900 characters."
      : responseDetail === "longer"
        ? "Response length: Longer explanation. Give more context about likely tone/subtext, what to watch for, next steps, and suggested wording. Keep it scannable in Slack and under 1700 characters."
        : "Response length: Default Slack coaching response. Be concise but useful.";
  const contextLine = contextStatus
    ? `Slack context status: ${contextStatus}${contextFailureReason ? ` (${contextFailureReason})` : ""}.`
    : "";
  const messageLine = messageText
    ? `\n\nSlack message/context:\n${messageText}`
    : contextStatus === "unavailable"
      ? "\n\nNo recent Slack context was available. Answer from the user's request without implying you saw surrounding messages."
      : "";
  const userPrompt = `${coachingProfileContext || "The user has not set specific Beckett coaching preferences yet."}
${responseDetailLine}
${contextLine}
${slackIntentInstruction(intent)}

User request:
${prompt}${messageLine}`;

  const maxTokens = responseDetail === "longer" ? 700 : responseDetail === "quick" ? 420 : 800;
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
