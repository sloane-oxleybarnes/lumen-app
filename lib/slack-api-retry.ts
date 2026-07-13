export function slackApiRetryDelayMs(input: {
  attempt: number;
  status: number;
  retryAfter?: string | null;
  error?: string | null;
}) {
  if (input.status !== 429 && input.error !== "ratelimited") return null;

  const retryAfterSeconds = Number(input.retryAfter);
  const baseDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1_000
    : 1_000;

  // Concurrent slash commands normally receive the same Retry-After value.
  // Stagger later attempts so they do not collide again on the same DM channel.
  return Math.min(8_000, Math.max(1_000, baseDelay) + input.attempt * 400);
}
