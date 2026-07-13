import assert from "node:assert/strict";
import test from "node:test";

import { formatSlackPrepAssessment } from "../lib/slack-prep-copy.ts";

test("Prep keeps complete, useful coaching sentences", () => {
  const assessment = formatSlackPrepAssessment([
    "~ Goal ~ Secure a clear agreement that on-call coverage will be limited to one weekend per month, with advance notice for exceptions.",
    "~ Say this first ~ I want to talk about my on-call schedule. I’m committed to the team, but covering more than one weekend a month is not sustainable. Can we agree on that limit?",
    "~ If they push back ~ If they say everyone needs to be flexible, explain that predictability helps you stay effective and ask what coverage plan could meet both needs.",
  ].join("\n"));

  assert.match(assessment, /with advance notice for exceptions\./);
  assert.match(assessment, /Can we agree on that limit\?/);
  assert.match(assessment, /what coverage plan could meet both needs\./);
  assert.doesNotMatch(assessment, /…/);
});

test("Prep leaves nonstandard model output intact instead of deleting details", () => {
  const response = "Here is the most useful next step in complete sentences.";
  assert.equal(formatSlackPrepAssessment(response), response);
});
