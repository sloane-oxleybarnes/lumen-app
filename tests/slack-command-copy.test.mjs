import assert from "node:assert/strict";
import test from "node:test";
import { buildSlackCommandExcerpt } from "../lib/slack-command-copy.ts";

test("slash command roots show a short, safe copy of the original input", () => {
  assert.equal(
    buildSlackCommandExcerpt("rewrite", '"I need the scope to stop changing."'),
    "Original draft: “I need the scope to stop changing.”"
  );
  assert.equal(
    buildSlackCommandExcerpt("decode", "Please ask <@U123> & confirm"),
    "Original message: “Please ask &lt;@U123&gt; &amp; confirm”"
  );
  assert.equal(buildSlackCommandExcerpt("prep", "Talk to my manager"), "");
  assert.match(buildSlackCommandExcerpt("respond", "x".repeat(220)), /…”$/);
});
