import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuestSlashCoachingPrompt,
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
