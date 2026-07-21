# Beckett

Beckett is a workplace communication practice product for neurodivergent professionals. It helps people prepare for difficult conversations, practice what they want to say, and reflect on what happened afterward.

This repository contains Beckett’s existing beta web product and the isolated Adaptive Conversation Simulator built for the OpenAI GPT-5.6 competition.

## Competition feature

The Adaptive Conversation Simulator lives behind the Labs route:

`/labs/adaptive-conversation`

The submitted experience supports two practice channels:

- **Text conversation** — a stateful simulated person responds turn by turn and can disagree, misunderstand, resist, or leave information unresolved.
- **Phone call** — the same simulation contract is used through the OpenAI Realtime API for spoken responses, microphone input, live audio, captions, pause, and an end-of-call debrief.

Both channels use a session-specific setup snapshot. The snapshot can include a general scenario or an approved Beckett contact context, the user’s private goal and concern, the person’s relationship and speaking style, constraints, difficulty mode, and (for phone) a voice preference. New simulated assumptions are not written back to permanent contacts.

The simulator includes:

- realistic, supportive, and challenging interaction modes;
- private simulated-person state rather than a coaching persona speaking for Beckett;
- structured debriefs covering what worked, resistance, goal progress, and up to three concrete turning points;
- text-only replay from a turning point, preserving the original trajectory;
- user-controlled transcript history and deletion; and
- pause/help/finish states while preserving the existing Bedrock coaching experience.

The simulator is isolated from Beckett’s primary Bedrock coaching system and from Slack behavior. The Labs route is the only place where the GPT-5.6 simulator is used.

## How GPT-5.6 is used

GPT-5.6 is called only from server-side routes using the OpenAI Responses API. It is responsible for:

1. generating the simulated person’s next response from the approved session snapshot and transcript;
2. maintaining uncertainty, boundaries, resistance, misunderstandings, tone, and relationship dynamics across turns;
3. producing structured assessments, turning points, replay outcomes, and optional in-session nudges; and
4. keeping the simulated person separate from Beckett’s coaching voice and the user’s private goal.

Phone mode uses the OpenAI Realtime API for low-latency speech-to-speech interaction. Realtime semantic VAD handles turn boundaries, while the same persona instructions and session snapshot keep phone and text behavior aligned.

The model can be selected with `OPENAI_SIMULATOR_MODEL`; the default is `gpt-5.6`. The Realtime model can be selected with `OPENAI_REALTIME_MODEL`.

## How Codex was used

Codex was used throughout the competition work to:

- plan and refine the shared text/phone conversation contract;
- implement the isolated Labs routes, session lifecycle, transcript history, debrief, replay, and phone interface;
- iteratively tune persona prompts for natural tone, disagreement, pacing, uncertainty, privacy, and realistic endings;
- review screenshots and diagnose UI, audio, transcription, deployment, and environment issues;
- run lint, TypeScript checks, and focused regression checks after changes; and
- keep the GPT-5.6 feature scoped away from Slack code, Slack configuration, and the Bedrock coaching path.

## Local development

Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
npm run dev
```

Create `.env.local` with server-side credentials. Never commit this file or print secret values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
GPT56_SIMULATOR_ENABLED=true
OPENAI_SIMULATOR_MODEL=gpt-5.6
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
```

Apply the Supabase migrations in `supabase/migrations/`, including the adaptive conversation migrations, before testing the Labs route. The simulator requires an authenticated user with approved beta access.

Useful checks:

```bash
npm run lint
npx tsc --noEmit
```

Open [http://localhost:3000](http://localhost:3000), sign in, and visit `/labs/adaptive-conversation`.

## Repository and deployment notes

The competition branch is `codex/gpt-5-6-extension`. Preview and production deployments must provide the required environment variables in their respective server-side environments. API keys belong in the deployment secret manager, never in browser code, the README, or the repository.

The repository also contains Beckett’s broader beta and Slack integration. Those systems remain part of the product but are outside the GPT-5.6 Labs feature and should not be modified when evaluating the competition submission.
