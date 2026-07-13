import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuestSlashCoachingPrompt,
  extractGuestPrepOutcomeAndConcern,
  guestPracticeOpening,
  guestStarterIntent,
  shouldLoadGuestConversationContext,
} from "../lib/slack-guest-routing.ts";

test("starter prompts route deterministically without Prep fallback", () => {
  assert.equal(guestStarterIntent("Help me decode a Slack message."), "decode");
  assert.equal(guestStarterIntent("Help me draft a response to a Slack message."), "respond");
  assert.equal(guestStarterIntent("Help me rewrite a draft."), "rewrite");
  assert.equal(guestStarterIntent("Help me prepare for a difficult conversation."), "prep");
});

test("fresh explicit slash requests do not load unrelated DM history", () => {
  assert.equal(shouldLoadGuestConversationContext({}), false);
  assert.equal(shouldLoadGuestConversationContext({ selectedMessageText: "Fine." }), true);
  assert.equal(shouldLoadGuestConversationContext({ threadTs: "123.456" }), true);
  assert.equal(shouldLoadGuestConversationContext({ latestMessageText: "Latest message" }), true);
});

test("Respond and Rewrite require immediate usable output", () => {
  const respond = buildGuestSlashCoachingPrompt("respond", "Can you send it today?");
  assert.match(respond, /exactly three/i);
  assert.match(respond, /Confirm, Negotiate, and Clarify/);
  assert.match(respond, /Do not ask a setup question/i);

  const rewrite = buildGuestSlashCoachingPrompt("rewrite", "I already told you this.");
  assert.match(rewrite, /Preserve the user's meaning, request, and boundaries/);
  assert.match(rewrite, /Exact draft: I already told you this\./);
});

test("Prep extracts an explicit concern instead of asking for it again", () => {
  const result = extractGuestPrepOutcomeAndConcern(
    "I want us to agree on priorities so the workload is realistic. I'm worried they'll think I can't prioritize. Where do you think I should have this conversation?"
  );
  assert.equal(result.outcome, "I want us to agree on priorities so the workload is realistic.");
  assert.equal(result.concern, "I'm worried they'll think I can't prioritize.");
  assert.equal(extractGuestPrepOutcomeAndConcern("I want clearer priorities.").concern, null);
  assert.equal(
    extractGuestPrepOutcomeAndConcern("I want alignment. I’m concerned they’ll dismiss it.").concern,
    "I’m concerned they’ll dismiss it."
  );
});

test("Practice starts in character without asking which version of the person to play", () => {
  assert.equal(guestPracticeOpening("your manager", "call"), "Hey, I have a few minutes—what's on your mind?");
  assert.doesNotMatch(guestPracticeOpening("your manager", "call"), /actual|general/i);
});
