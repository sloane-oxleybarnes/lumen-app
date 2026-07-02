# Beckett Slack Desktop App

This is the staging-first Slack app path for using Beckett inside Slack Desktop. It is separate from the Chrome extension and should be tested on the `staging` branch before any production rollout.

## What This Adds

- Slash command: `/beckett`
- Message shortcut: `Ask Beckett`
- Hackathon positioning: Beckett prepares neurodivergent workers for the conversations that matter at work
- Signed Slack request verification with `SLACK_SIGNING_SECRET`
- Beckett account matching through the existing `user_integrations` Slack connection
- Ephemeral coaching responses so Beckett does not post into public Slack channels
- Recent context in public channels, private channels, DMs, and group DMs after the user reconnects with the staging scopes
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
10. After changing scopes, reinstall/reconnect Slack from Beckett Settings so the bot receives `assistant:write`, `im:write`, and `im:history`, and the user receives `groups:history` and `mpim:history`.

## Testing

Use Slack Desktop or the Slack web app:

1. Run `/beckett` with no text.
   - Expected: Beckett returns subcommand examples.
2. Run `/beckett rewrite "Any update on this?"`.
   - Expected: Beckett shows Quick answer and Longer explanation buttons, then returns rewrite-focused coaching after a button click.
3. Run `/beckett decode "Sure, sounds fine."`, `/beckett draft ask my manager for clearer priorities this week`, `/beckett prep I need to give a teammate feedback`, `/beckett tone "I need this by Friday."`, and `/beckett followup remind Avery about the readout`.
   - Expected: Non-prep commands keep the same private Quick/Longer flow. `/beckett prep ...` opens a `Prep with Beckett` modal.
4. Run `/beckett respond help me answer this without sounding defensive`, `/beckett boundary I cannot take on another project this week`, `/beckett clarity I do not know what "clean this up" means`, and `/beckett practice my 1:1 with my manager about workload`.
   - Expected: Beckett returns neurodivergent-friendly workplace coaching with visible uncertainty boundaries and concrete wording.
5. Run `/beckett is this too direct? "I need this by Friday."`.
   - Expected: Freeform prompts still work.
6. Use the message shortcut on a real Slack message.
   - Expected: Beckett returns an ephemeral note about what is visible, what is only a possible interpretation, what to do next, and reply options.
7. Test with a Slack account that has not connected Slack in Beckett Settings.
   - Expected: Beckett asks the user to connect Slack first.
8. Test `/beckett` in a private channel and a group DM after reconnecting.
   - Expected: Beckett can include recent context; if Slack denies access, Beckett still answers from the prompt and says context was unavailable.
9. Submit the `Prep with Beckett` modal from `/beckett prep I need to ask my manager for a promotion`.
   - Expected: Beckett moves the coaching into the app Messages/Split View surface. If that surface is unavailable, Beckett sends a private fallback response beginning `I prepared this privately here because the Beckett coach panel was not available.`
10. Open the Beckett app Messages/Split View surface and send a follow-up message.
   - Expected: Beckett replies privately in the same agent thread.

## Hackathon Demo Story

1. A user sees a vague manager Slack thread before a 1:1.
2. The user clicks `Ask Beckett`.
3. Beckett explains what is visible, what is uncertain, and what not to over-read.
4. Beckett suggests the next move and 2-3 private reply options.
5. The user runs `/beckett prep I need to talk to my manager about workload in my 1:1`.
6. Beckett opens a modal to gather context.
7. Beckett moves the coaching into the Split View/Messages coach panel with talking points, an opening line, likely pushback, and a follow-up draft.

Closing line: Beckett helps neurodivergent workers communicate clearly inside the tools where work already happens.

## Production Notes

- Do not reuse staging Slack app secrets in production.
- Do not promote this to production until the slash command and message shortcut are stable with real beta users.
- Slack requires command and shortcut requests to be acknowledged quickly. These endpoints keep responses concise, but a future queue/background job would make longer AI responses more resilient.
- Slack Agent/Split View features require the **Agents** feature to be enabled in Slack app settings and may require reinstalling the app after the manifest adds agent scopes/events.
