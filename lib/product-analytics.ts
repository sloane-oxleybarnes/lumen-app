import { createHash } from "crypto";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

const SAFE_METADATA_KEYS = new Set([
  "action",
  "courseId",
  "courseTitle",
  "contextFailureReason",
  "contextMessageCount",
  "contextSource",
  "contextStatus",
  "event",
  "feedbackSource",
  "integration",
  "mode",
  "page",
  "platform",
  "rating",
  "responseFormat",
  "source",
  "threadCount",
]);

function hashEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function safeMetadata(metadata: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }
  }

  return safe;
}

export async function captureProductEvent({
  eventName,
  userId,
  email,
  source,
  metadata = {},
}: {
  eventName: string;
  userId?: string | null;
  email?: string | null;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  if (!POSTHOG_KEY) return;

  const distinctId = userId || (email ? `email:${hashEmail(email)}` : "anonymous");

  try {
    await fetch(`${POSTHOG_HOST.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: `beckett_${eventName}`,
        properties: {
          distinct_id: distinctId,
          source,
          event_name: eventName,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
          ...safeMetadata(metadata),
        },
      }),
    });
  } catch (error) {
    console.error("PostHog capture error:", error);
  }
}
