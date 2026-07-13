import assert from "node:assert/strict";
import test from "node:test";

import { slackApiRetryDelayMs } from "../lib/slack-api-retry.ts";

test("Slack API retries explicit rate limits and staggers later attempts", () => {
  assert.equal(slackApiRetryDelayMs({ attempt: 0, status: 429, retryAfter: "1" }), 1000);
  assert.equal(slackApiRetryDelayMs({ attempt: 1, status: 429, retryAfter: "1" }), 1400);
  assert.equal(slackApiRetryDelayMs({ attempt: 2, status: 200, error: "ratelimited" }), 1800);
  assert.equal(slackApiRetryDelayMs({ attempt: 0, status: 200, error: null }), null);
});
