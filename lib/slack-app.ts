import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { trackBetaEvent } from "@/lib/beta-events";
import { getPublicSiteUrl } from "@/lib/deployment-env";
import { supabaseAdmin } from "@/lib/server-admin";

const MAX_SLACK_TEXT_LENGTH = 2900;

export type SlackConnectedUser = {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  teamName: string | null;
  communicationPreferences: string[];
  coachingTone: string | null;
};

type SlackVerificationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

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

export function slackTextResponse(text: string, status = 200) {
  return NextResponse.json(
    {
      response_type: "ephemeral",
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: truncateSlackText(text),
          },
        },
      ],
    },
    { status }
  );
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

export async function postSlackResponse(responseUrl: string, text: string) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_type: "ephemeral",
      replace_original: false,
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: truncateSlackText(text),
          },
        },
      ],
    }),
  });
}

export async function lookupSlackConnectedUser(teamId: string, slackUserId: string) {
  const { data: integration, error } = await supabaseAdmin
    .from("user_integrations")
    .select("user_id, external_team_name")
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

export async function runSlackCoaching({
  user,
  action,
  prompt,
  sourceLabel,
  messageText,
}: {
  user: SlackConnectedUser;
  action: "slash_command" | "message_shortcut";
  prompt: string;
  sourceLabel: string;
  messageText?: string | null;
}) {
  await recordAiUsage(user.id, {
    source: "slack_desktop",
    action,
    metadata: {
      sourceLabel,
      teamName: user.teamName,
    },
  });

  const system = `You are Beckett, a workplace communication coach for neurodivergent professionals.
You are responding inside Slack, so be concise, practical, and easy to scan.
Help the user understand workplace tone, subtext, context, next steps, and possible replies.
Do not claim certainty about another person's intent. Use phrases like "may" or "likely" when interpreting tone.
Avoid generic encouragement. Give concrete language the user could use.
Format with short headings and bullets. Do not use markdown tables.`;

  const preferenceLine = user.communicationPreferences.length
    ? `What this user wants Beckett to help with: ${user.communicationPreferences.join(", ")}.`
    : "The user has not set specific Beckett help preferences.";
  const toneLine = user.coachingTone ? `Preferred coaching tone: ${user.coachingTone}.` : "";
  const messageLine = messageText ? `\n\nSlack message/context:\n${messageText}` : "";
  const userPrompt = `${preferenceLine}
${toneLine}

User request:
${prompt}${messageLine}`;

  const text = await callAnthropic(system, [{ role: "user", content: userPrompt }], 800);

  await trackBetaEvent({
    userId: user.id,
    email: user.email || undefined,
    eventName: "analysis_completed",
    source: "slack_desktop",
    metadata: {
      action,
      sourceLabel,
      teamName: user.teamName,
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
