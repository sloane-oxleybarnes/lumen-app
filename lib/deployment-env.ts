export function getDeploymentEnv() {
  return (
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  ).toLowerCase();
}

export function normalizePublicUrl(value?: string | null) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  raw = raw.replace(/^['"]|['"]$/g, "");

  if (/^[A-Z0-9_]+=/.test(raw)) {
    raw = raw.slice(raw.indexOf("=") + 1).trim();
  }

  if (!/^https?:\/\//i.test(raw)) {
    raw = /^(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  }

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export function getPublicSiteUrl(fallback?: string | null) {
  return (
    normalizePublicUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizePublicUrl(process.env.NEXT_PUBLIC_VERCEL_URL) ||
    normalizePublicUrl(process.env.VERCEL_URL) ||
    normalizePublicUrl(fallback) ||
    "https://meetbeckett.co"
  );
}

export function isStagingLikeDeployment() {
  const env = getDeploymentEnv();
  return (
    env === "staging" ||
    env === "preview" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV !== "production"
  );
}

export function canSendLifecycleMessages() {
  return !isStagingLikeDeployment() || process.env.ENABLE_STAGING_EMAILS === "true";
}

export function lifecycleMessagesDisabledReason() {
  return (
    `Lifecycle messages are disabled in ${getDeploymentEnv()} by default. ` +
    "Set ENABLE_STAGING_EMAILS=true only when you intentionally want this environment to send external beta emails or Loops events."
  );
}
