import assert from "node:assert/strict";
import test from "node:test";

import { isUserCorrectingWrongFlow } from "../lib/slack-guided-intent.ts";

test("Prep goals containing 'no more' do not leave the guided flow", () => {
  assert.equal(
    isUserCorrectingWrongFlow("I want to talk about my on-call schedule, I'd like it to be no more than once a month"),
    false
  );
});

test("explicit corrections can still override the guided flow", () => {
  assert.equal(isUserCorrectingWrongFlow("No, I want help rewriting it."), true);
  assert.equal(isUserCorrectingWrongFlow("That's not what I mean."), true);
});
