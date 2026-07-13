import { createHmac, timingSafeEqual } from "crypto";
import { getPublicSiteUrl } from "@/lib/deployment-env";

export type SlackPracticeLinkPayload = {
  teamId: string;
  slackUserId: string;
  channelId: string;
  prepThreadTs: string;
  expiresAt: number;
};

function practiceLinkSecret() {
  return process.env.SLACK_PRACTICE_REDIRECT_SECRET || process.env.SLACK_SIGNING_SECRET || "";
}

export function createSlackPracticeToken(payload: Omit<SlackPracticeLinkPayload, "expiresAt">) {
  const secret = practiceLinkSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 15 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySlackPracticeToken(token: string) {
  const secret = practiceLinkSecret();
  const [body, signature] = token.split(".");
  if (!secret || !body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SlackPracticeLinkPayload;
    if (!payload.teamId || !payload.slackUserId || !payload.channelId || !payload.prepThreadTs || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSlackPracticeUrl(payload: Omit<SlackPracticeLinkPayload, "expiresAt">) {
  const token = createSlackPracticeToken(payload);
  return token ? `${getPublicSiteUrl()}/api/slack/practice/start?token=${encodeURIComponent(token)}` : null;
}
