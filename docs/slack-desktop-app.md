# Beckett Slack Desktop App

This is the staging-first Slack app path for using Beckett inside Slack Desktop. It is separate from the Chrome extension and should be tested on the `staging` branch before any production rollout.

## What This Adds

- Slash command: `/beckett`
- Message shortcut: `Ask Beckett about this message`
- Signed Slack request verification with `SLACK_SIGNING_SECRET`
- Beckett account matching through the existing `user_integrations` Slack connection
- Ephemeral coaching responses so Beckett does not post into public Slack channels

## Staging Setup

1. Create a separate Slack app named `Beckett Staging`.
2. Use the manifest in `docs/slack-app-manifest-staging.yaml`.
3. Replace every `https://YOUR-STAGING-URL` placeholder with the active staging URL, for example:
   - `https://beckett-git-staging-sloane-s-projects1.vercel.app`
4. In Vercel Preview environment variables for the `staging` branch, add:
   - `SLACK_SIGNING_SECRET`
   - `SLACK_OAUTH_WORKER_URL`
5. Deploy a separate staging copy of `extension/workers/slack-oauth.js` with the staging Slack app's `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.
6. In Slack app settings, confirm these URLs:
   - Slash command request URL: `https://YOUR-STAGING-URL/api/slack/commands`
   - Interactivity request URL: `https://YOUR-STAGING-URL/api/slack/interactions`
   - OAuth redirect URL: `https://YOUR-STAGING-URL/api/slack/callback`
7. Install the Slack app into the test workspace.
8. Sign into Beckett staging and connect Slack from Settings so the Slack user ID maps to a Beckett user.

## Testing

Use Slack Desktop or the Slack web app:

1. Run `/beckett` with no text.
   - Expected: Beckett returns usage examples.
2. Run `/beckett help me rewrite: "Any update on this?"`.
   - Expected: Beckett returns an ephemeral coaching response.
3. Use the message shortcut on a real Slack message.
   - Expected: Beckett returns an ephemeral note about tone, context, and what to say next.
4. Test with a Slack account that has not connected Slack in Beckett Settings.
   - Expected: Beckett asks the user to connect Slack first.

## Production Notes

- Do not reuse staging Slack app secrets in production.
- Do not promote this to production until the slash command and message shortcut are stable with real beta users.
- Slack requires command and shortcut requests to be acknowledged quickly. These endpoints keep responses concise, but a future queue/background job would make longer AI responses more resilient.
