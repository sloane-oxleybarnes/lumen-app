# Beckett Demo Seed Environment

This folder contains a synthetic demo corpus for testing Beckett against a longer, messier set of work relationships without using real private data. It can seed:

- A Gmail demo mailbox with realistic email threads.
- A Slack demo workspace with realistic channel/DM conversations.
- Beckett contacts, identifiers, and relationship summaries for the Supabase project you choose.

Use this only with dedicated demo accounts and the Supabase project you intend to demo against.

## Recommended Setup

1. Create a dedicated demo Google account, for example `beckett.demo@gmail.com`.
2. Connect that Google account to the Beckett app/environment you will demo.
3. Create a dedicated Slack workspace for the demo.
4. Create demo Slack users for the personas in `demo/corpus/beckett-demo-corpus.json`.
5. Install the Beckett Slack app into the demo workspace and invite it to each demo channel.
6. Apply the Phase 4 migration to the target Supabase project before seeding contacts.

Slack messages posted by the bot are useful for a visible demo corpus, but they will be authored by the bot. For true Slack contact-linking tests, map real Slack user IDs with `DEMO_SLACK_USER_ID_MAP_JSON` and create or capture at least a few messages from those actual demo users. Beckett should treat visible display-name-only matches as suggestions, not confirmed links.

## Commands

```bash
npm run demo:plan
npm run demo:seed:gmail
npm run demo:seed:slack
npm run demo:seed:contacts
npm run demo:seed:all
```

Add `-- --dry-run` to preview network mutations:

```bash
npm run demo:seed:all -- --dry-run
```

## Environment

Copy `demo/.env.example` and export the values in your shell, or paste them into a local env loader before running the scripts. The script intentionally does not read `.env` files itself so secrets do not become magical or easy to run against the wrong project.

Required for Gmail:

- `DEMO_GMAIL_ACCESS_TOKEN`
- `DEMO_GMAIL_USER`, usually `me`

Required for Slack:

- `DEMO_SLACK_BOT_TOKEN`
- `DEMO_SLACK_CHANNEL_MAP_JSON`

Required for Beckett contact seeding:

- `DEMO_SUPABASE_URL`
- `DEMO_SUPABASE_SERVICE_ROLE_KEY`
- `DEMO_BECKETT_USER_ID`

Optional but recommended for Phase 4 Slack linking:

- `DEMO_SLACK_TEAM_ID`
- `DEMO_SLACK_USER_ID_MAP_JSON`

## What Gets Seeded

The corpus includes five synthetic contacts:

- Maya Chen, a manager with direct but supportive coaching context.
- Jordan Lee, a teammate with handoff ambiguity.
- Priya Shah, a cross-functional partner who is deadline-driven.
- Sam Rivera, a client who is warm but prone to scope drift.
- Eli Morgan, a direct report who benefits from specific, low-shame feedback.

The data intentionally includes unresolved topics, tone differences across channels, competing deadlines, and a few mildly awkward messages. That gives Beckett enough texture to show relationship-aware drafting without making contacts the center of the app.

## Safety Notes

- Do not run against production unless that is explicitly the approved hackathon demo environment.
- Do not use real customer or teammate data.
- Do not seed a personal mailbox or primary Slack workspace.
- Gmail seeding inserts messages into the mailbox; it does not send them.
- Slack seeding posts messages to real channels, so use a demo workspace.
