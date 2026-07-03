# Beckett Slack Desktop App

This is the Slack-only hackathon path for using Beckett inside Slack Desktop. It is separate from the Chrome extension, Gmail, courses, and the broader Beckett beta product.

## What This Adds

- Slash command: `/beckett`
- Message shortcut: `Ask Beckett`
- Hackathon positioning: Beckett prepares neurodivergent workers for the conversations that matter at work
- Signed Slack request verification with `SLACK_SIGNING_SECRET`
- Beckett account matching through the existing `user_integrations` Slack connection
- Ephemeral coaching responses so Beckett does not post into public Slack channels
- Active context plus relevant live Slack search across authorized public channels, private channels, DMs, and group DMs after the user reconnects with the latest scopes
- Tool-style agent layer for `analyze_slack_thread`, `draft_slack_reply`, `coach_for_clarity`, `prep_difficult_conversation`, `summarize_relationship_context`, and `explain_tone_without_over_inference`
- Modal intake for `/beckett prep ...`, followed by Beckett coaching in the Slack Agent/Split View Messages surface when available

## Staging Setup

1. Create a separate Slack app named `Beckett Staging`.
2. Use the manifest in `docs/slack-app-manifest-staging.yaml`.
3. Use the public production URL for Slack app callbacks so Slack can reach Beckett without Vercel preview protection:
   - `https://www.meetbeckett.co`
4. In Vercel Preview environment variables for the `staging` branch, add:
   - `SLACK_SIGNING_SECRET`
   - `SLACK_OAUTH_WORKER_URL`
5. Deploy a separate staging copy of `extension/workers/slack-oauth.js` with the staging Slack app's `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.
6. In Slack app settings, confirm these URLs:
   - Slash command request URL: `https://www.meetbeckett.co/api/slack/commands`
   - Interactivity request URL: `https://www.meetbeckett.co/api/slack/interactions`
   - Event subscriptions request URL: `https://www.meetbeckett.co/api/slack/events`
   - OAuth redirect URL: `https://www.meetbeckett.co/api/slack/callback`
7. In Slack app settings, enable **Agents**. Use the Agent messaging experience when prompted.
8. Install or reinstall the Slack app into the test workspace.
9. Sign into Beckett staging and connect Slack from Settings so the Slack user ID maps to a Beckett user.
10. After changing scopes, reinstall/reconnect Slack from Beckett Settings so the bot receives `assistant:write`, `im:write`, and `im:history`, and the user receives `groups:history`, `mpim:history`, and the `search:read.*` scopes.

## Slack-Only Hackathon Test Plan

Use Slack Desktop or the Slack web app:

### 1. Basic Slack App Health

1. Run `/beckett` with no text.
   - Expected: Beckett returns a clean Slack-native help card with command examples.
   - Expected: No `operation_timeout`.
   - Expected: No visible asterisk-heavy or terminal-like formatting.
2. Run `/beckett decode "Sure, sounds fine."`.
   - Expected: Slack acknowledges quickly, then shows a private Quick answer / Longer explanation choice card.
3. Click `Quick answer`, then repeat and click `Longer explanation`.
   - Expected: Beckett replaces the choice card with private coaching.
   - Expected: The response uses clean section labels and short bullets.
   - Expected: No public channel message is posted.

### 2. Message Shortcut: Decode + Respond

1. In the demo workspace, open the vague manager task handoff thread.
2. Use the message shortcut: `Ask Beckett`.
   - Expected: Beckett responds privately.
   - Expected: Beckett separates what is visible from possible interpretation.
   - Expected: Beckett does not claim the manager is annoyed, comfortable, aligned, or reacting unless that is visible in the provided Slack context.
   - Expected: Beckett suggests a clear next move and 2-3 reply options.
3. Repeat with the passive-aggressive teammate thread.
   - Expected: Beckett helps the user avoid over-reading and gives a practical reply option.

### 3. Slash Commands: Workplace Coaching

Test these commands:

1. `/beckett respond help me answer this without sounding defensive`
2. `/beckett boundary I cannot take on another project this week`
3. `/beckett clarity I do not know what "clean this up" means`
4. `/beckett practice my 1:1 with my manager about workload`
5. `/beckett tone "I need this by Friday."`
6. `/beckett followup remind Avery about the readout`

Expected:
- Non-prep commands use the private Quick answer / Longer explanation flow.
- Beckett gives neurodivergent-friendly workplace communication coaching.
- Beckett avoids clinical labels, hidden-intent claims, and overconfident reads.
- Draft options stay Slack-ready and easy to copy.

### 4. Prep Modal: Difficult Conversation Intake

1. Run `/beckett prep I need to ask my manager for a raise`.
   - Expected: No `operation_timeout`.
   - Expected: Slack quickly shows `Opening Beckett's prep form...`.
   - Expected: The `Prep with Beckett` modal opens.
2. Fill in:
   - Who are you talking to?
   - What conversation do you need to have?
   - What outcome do you want?
   - What evidence or context should Beckett know?
   - What are you worried they may push back on?
3. Submit the modal.
   - Expected: Beckett sends private prep coaching.
   - Expected: Output includes conversation goal, talking points, opening sentence, likely pushback, practice prompt, and follow-up draft.
   - Expected: If the sidebar/Split View surface is unavailable, Beckett uses a private fallback response.

### 5. Sidebar / Assistant Coaching Flow

1. Open Beckett from Slack's app/sidebar area.
2. Ask: `Help me prepare to ask my manager for a raise`.
   - Expected: Beckett behaves like a coach, not a single-wall-of-text chatbot.
   - Expected: Beckett can ask focused follow-up questions one at a time when more context is needed.
   - Expected: Beckett looks for relevant Slack history before asking the user to manually provide evidence.
3. Confirm evidence behavior:
   - Expected: Beckett says it found possible supporting evidence from Slack context, not guaranteed accomplishments.
   - Expected: Beckett asks the user to confirm what to include.
   - Expected: Beckett distinguishes visible Slack facts from interpretation.
4. Continue the prep flow.
   - Expected: Beckett produces an opening line, talking points, likely pushback, and follow-up draft.

### 6. Broader Slack Context

1. Test from a channel related to the manager or project.
   - Expected: Beckett uses active context plus relevant prior Slack history when available.
2. Test from an unrelated channel.
   - Expected: Beckett can still search relevant authorized Slack history based on the user's request.
3. Test a person/topic with little or no history.
   - Expected: Beckett says it does not have enough prior context and coaches from the prompt instead of inventing evidence.
4. Test after reconnecting Slack with the latest scopes.
   - Expected: Beckett can search authorized public channels, private channels, DMs, and group DMs.
5. Test with missing/denied scopes.
   - Expected: Beckett falls back gracefully and says broader Slack context was unavailable.

### 7. Privacy + Guardrail Checks

1. Confirm Beckett responses are private/ephemeral by default.
2. Confirm Beckett does not post into the channel automatically.
3. Confirm Beckett does not store raw Slack search results or full Slack history by default.
4. Confirm Beckett does not infer diagnosis or hidden intent.
5. Confirm Beckett never says someone reacted, agreed, felt comfortable, was annoyed, or pushed back unless visible in retrieved Slack context.
6. Confirm no Chrome extension, Gmail, courses, website dashboard, or beta-signup features are shown in the hackathon demo.

### 8. Reviewer Access

1. Confirm the Slack app is installed and working in the sandbox workspace.
2. Confirm `slackhack@salesforce.com` and `testing@devpost.com` have access before submission.
3. Confirm demo workspace threads are populated with non-sensitive test data.
4. Confirm the Devpost submission includes:
   - Slack sandbox URL
   - Demo video under 3 minutes
   - Architecture diagram
   - Slack-only product description
   - Track: Slack Agent for Good

## Hackathon Demo Story

1. A user sees a vague manager Slack thread before a 1:1.
2. The user clicks `Ask Beckett`.
3. Beckett explains what is visible, what is uncertain, and what not to over-read.
4. Beckett suggests the next move and 2-3 private reply options.
5. The user runs `/beckett prep I need to talk to my manager about workload in my 1:1`.
6. Beckett opens a modal to gather context.
7. The user continues in Beckett's Slack assistant/sidebar experience.
8. Beckett searches relevant Slack history for possible evidence, asks the user to confirm what to include, then builds talking points, an opening line, likely pushback, and a follow-up draft.

Closing line: Beckett helps neurodivergent workers communicate clearly inside the tools where work already happens.

## Production Notes

- Do not reuse staging Slack app secrets in production.
- Keep the hackathon submission Slack-only. Do not include Chrome extension, Gmail, courses, beta signup, or web dashboard flows in the demo.
- Slack requires command and shortcut requests to be acknowledged quickly. These endpoints keep responses concise, but a future queue/background job would make longer AI responses more resilient.
- Slack Agent/Split View features require the **Agents** feature to be enabled in Slack app settings and may require reinstalling the app after the manifest adds agent scopes/events.
