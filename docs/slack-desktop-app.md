# Beckett Slack Desktop App

This is the Slack-only hackathon path for using Beckett inside Slack Desktop. It is separate from the Chrome extension, Gmail, courses, and the broader Beckett beta product.

## What This Adds

- Slash command: `/beckett`
- Message shortcuts: `Beckett - Decode` and `Beckett - Respond`
- Hackathon positioning: Beckett prepares neurodivergent workers for the conversations that matter at work
- Signed Slack request verification with `SLACK_SIGNING_SECRET`
- Beckett account matching through the existing `user_integrations` Slack connection
- Minimal private acknowledgements in Slack command/message surfaces, with the real coaching routed into Beckett's private Slack assistant conversation when available
- Active context plus relevant live Slack search across authorized public channels, private channels, DMs, and group DMs after the user reconnects with the latest scopes
- Tool-style agent layer for `analyze_slack_thread`, `draft_slack_reply`, `coach_for_clarity`, `prep_difficult_conversation`, `summarize_relationship_context`, and `explain_tone_without_over_inference`
- Sidebar-only guided flows for `/beckett respond`, `/beckett rewrite`, `/beckett decode`, `/beckett prep`, and `/beckett practice`; no pop-up modal intake in the hackathon demo
- Slack Messages native suggested prompts for Beckett starter actions
- Slack App Home as the Beckett History hub for recent and archived coaching conversations

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
7. In Slack app settings, enable **Agents** and App Home's **Home tab**. Use the Agent messaging experience when prompted.
8. Install or reinstall the Slack app into the test workspace.
9. Sign into Beckett staging and connect Slack from Settings so the Slack user ID maps to a Beckett user.
10. After changing scopes, reinstall/reconnect Slack from Beckett Settings so the bot receives `assistant:write`, `im:write`, and `im:history`, and the user receives `groups:history`, `mpim:history`, and the `search:read.*` scopes.
11. Run the latest Supabase migration so Slack Home can store privacy-safe coaching history metadata.

## Slack-Only Hackathon Test Plan

Use Slack Desktop or the Slack web app:

### 1. Basic Slack App Health

1. Run `/beckett` with no text.
   - Expected: Beckett returns a clean Slack-native help card with command examples.
   - Expected: No `operation_timeout`.
   - Expected: No visible asterisk-heavy or terminal-like formatting.
2. Run `/beckett decode "Sure, sounds fine."`.
   - Expected: Slack acknowledges quickly.
   - Expected: No pop-up or modal opens.
   - Expected: Beckett moves the coaching into the private Beckett assistant conversation when available.
   - Expected: The response uses clean section labels and short bullets.
   - Expected: No public channel message is posted.

### 1A. Beckett Suggested Prompts + Home History

1. Open Beckett in Slack and select the Messages tab.
   - Expected: Slack's native suggested prompts show `Decode a Selected Message`, `Respond to a Selected Message`, `Edit a Draft`, and `Prep`.
   - Expected: The suggested prompt title says `What can Beckett help with today?`
2. Click a selected-message suggested prompt, such as `Respond to a Selected Message`.
   - Expected: Beckett gives instructions for using the message’s `...` menu, `/beckett respond` in the source conversation, or a Slack message link.
   - Expected: The prompt sends normal assistant text, not a literal `/beckett` command.
   - Expected: No public channel message is posted.
3. Click `Edit a Draft`.
   - Expected: Beckett asks who the message is going to before asking for draft text.
4. Open the Home tab.
   - Expected: Home shows `Beckett History`.
   - Expected: Recent active and archived conversations appear.
5. Click `Continue` on a Home history card.
   - Expected: Beckett posts a private continuation message with the prior summary and next-step buttons.
6. Click `Archive conversation` inside an active Messages thread.
   - Expected: The conversation is archived.
   - Expected: Beckett posts the bottom start card with the same starter labels as the native suggested prompts.
   - Expected: The archived conversation remains visible in Home history without an Archive button.

### 2. Message Shortcut: Decode + Respond

1. In the demo workspace, open the vague manager task handoff thread.
2. Use the message shortcut: `Beckett - Decode`.
   - Expected: Beckett responds privately.
   - Expected: Beckett separates what is visible from possible interpretation.
   - Expected: Beckett does not claim the manager is annoyed, comfortable, aligned, or reacting unless that is visible in the provided Slack context.
   - Expected: Beckett separates visible facts from possible interpretation without drafting response options unless useful.
3. Use the message shortcut: `Beckett - Respond`.
   - Expected: Beckett starts a private response thread.
   - Expected: Beckett gives a concise read, a next move, and 2-3 reply options.
   - If Slack still shows only `Ask Beckett`, update and reinstall the Slack app from the current staging manifest.
4. Repeat with the passive-aggressive teammate thread.
   - Expected: Beckett helps the user avoid over-reading and gives a practical reply option.

### 3. Slash Commands: Workplace Coaching

Test these commands:

1. `/beckett respond help me answer this without sounding defensive`
2. `/beckett rewrite "Any update on this?"`
3. `/beckett decode "Sure, sounds fine."`
4. `/beckett prep I need to talk to my manager about workload in my 1:1`
5. `/beckett practice my 1:1 with my manager about workload`

Expected:
- Commands do not open pop-up modals.
- Slash command surfaces only show a tiny private acknowledgement.
- Final coaching routes to Beckett's private assistant conversation when available.
- Beckett gives neurodivergent-friendly workplace communication coaching.
- Beckett avoids clinical labels, hidden-intent claims, and overconfident reads.
- Draft options stay Slack-ready and easy to copy.

Removed modes:
- `/beckett draft`
- `/beckett clarity`
- `/beckett boundary`
- `/beckett followup`
- `/beckett tone`

Expected:
- Beckett should point users to `/beckett respond`, `/beckett rewrite`, `/beckett decode`, `/beckett prep`, or `/beckett practice`.

### 4. Sidebar Prep: Difficult Conversation Walkthrough

1. Run `/beckett prep I need to ask my manager for a raise`.
   - Expected: No `operation_timeout`.
   - Expected: Slack quickly shows a private acknowledgement.
   - Expected: No modal opens.
   - Expected: Beckett starts a private sidebar walkthrough.
2. Continue in the Beckett assistant conversation.
   - Expected: Beckett asks one focused question at a time.
   - Expected: Beckett asks who you are talking to if missing.
   - Expected: Beckett asks the desired outcome.
   - Expected: Beckett asks likely pushback/concerns.
   - Expected: Beckett searches relevant Slack history for possible evidence and asks you to confirm by number.
3. Confirm evidence.
   - Expected: Output includes conversation goal, talking points, opening sentence, likely pushback, practice prompt, and follow-up draft.

### 4A. Sidebar Practice: Role-Play Setup

1. Run `/beckett practice my 1:1 with my manager about workload`.
   - Expected: Slack quickly shows a private acknowledgement.
   - Expected: No modal opens.
   - Expected: Beckett starts a private sidebar practice setup.
2. Continue in the Beckett assistant conversation.
   - Expected: Beckett asks who you are practicing with if missing.
   - Expected: Beckett asks what you want to get better at.
   - Expected: Beckett asks what kind of pushback to role-play.
   - Expected: Beckett starts the practice as the other person.

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
2. The user clicks `Beckett - Respond`.
3. Beckett explains what is visible, what is uncertain, and what not to over-read.
4. Beckett suggests the next move and 2-3 private reply options.
5. The user runs `/beckett prep I need to talk to my manager about workload in my 1:1`.
6. Beckett starts a private sidebar walkthrough.
7. Beckett asks one focused question at a time.
8. Beckett uses selected/current Slack context first and uses Real-Time Search (`assistant.search.context`) as an enhancer when Slack enables it for the sandbox/app. If RTS is unavailable, request Slack to enable Real-Time Search API / `assistant.search.context` for the hackathon sandbox and keep the demo on selected/current conversation context.

Closing line: Beckett helps neurodivergent workers communicate clearly inside the tools where work already happens.

## Production Notes

- Do not reuse staging Slack app secrets in production.
- Keep the hackathon submission Slack-only. Do not include Chrome extension, Gmail, courses, beta signup, or web dashboard flows in the demo.
- Slack requires command and shortcut requests to be acknowledged quickly. These endpoints keep responses concise, but a future queue/background job would make longer AI responses more resilient.
- Slack Agent/Split View features require the **Agents** feature to be enabled in Slack app settings and may require reinstalling the app after the manifest adds agent scopes/events.
- Broader Slack history depends on Real-Time Search availability. If `assistant.search.info` or `assistant.search.context` returns `feature_not_enabled`, the app should still answer from selected/current context and should not claim RTS as working in the submission.
