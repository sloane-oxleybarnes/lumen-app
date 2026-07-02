# Beckett Slack Hackathon Submission Draft

## Track

Primary: Slack Agent for Good  
Backup: New Slack Agent

## One-Line Pitch

Beckett prepares neurodivergent workers for the conversations that matter at work.

## Description

Beckett is a private workplace communication coach in Slack. It helps neurodivergent professionals decode confusing Slack threads, avoid over-reading ambiguous tone, draft replies that match their intent, and prepare for difficult conversations before they happen.

Instead of acting like a generic chatbot or writing assistant, Beckett guides the user through conversation strategy: what is visible, what is uncertain, what the next step should be, and how to say it clearly. Responses are private and ephemeral by default, and Beckett does not store full Slack history by default.

## Demo Workflow

1. The user sees a vague manager Slack message before a 1:1.
2. The user opens the message shortcut and chooses `Ask Beckett`.
3. Beckett explains what is visible in the thread, what is only a possible interpretation, and what not to over-read.
4. Beckett suggests a next step and 2-3 reply options: Direct but kind, Warm and collaborative, and Concise.
5. The user runs `/beckett prep I need to talk to my manager about workload in my 1:1`.
6. Beckett opens a short modal to gather the person, goal, evidence, and likely pushback.
7. Beckett moves the coaching into the Slack Agent/Split View Messages surface with talking points, an opening line, likely pushback, a practice prompt, and a follow-up draft.

## Demo Workspace Threads

### Vague Manager Task Handoff

Priya: Can you clean up the onboarding flow before Friday?  
Priya: Nothing huge, just make it easier for the review.

User asks Beckett: What does she actually want from me here?

### Passive-Aggressive Teammate Thread

Morgan: I guess I can take another pass at the deck if that helps.  
Morgan: I just thought we were already aligned on the direction.

User asks Beckett: Is Morgan annoyed or am I overthinking this?

### Boundary/Workload 1:1

Nick: Can you also take on the vendor follow-up this week?  
Nick: I know you have a lot, but it should be quick.

User asks Beckett: Help me prep for my 1:1. I need to say I cannot take this on without sounding difficult.

### Feedback Response

Claire: The client email was clear, but next time I need you to flag risk earlier.  
Claire: We were too close to the deadline to adjust.

User asks Beckett: Help me respond without sounding defensive.

## Architecture Diagram

```mermaid
flowchart LR
  A["Slack message shortcut or /beckett command"] --> B["Next.js Slack endpoint"]
  B --> C["Slack request signature verification"]
  C --> D["Beckett account + Slack integration lookup"]
  D --> E["Slack agent tool selector"]
  E --> F["Anthropic coaching call with Beckett guardrails"]
  F --> G["Slack Agent/Split View coach panel"]
  F --> I["Private ephemeral fallback"]
  D --> H["Optional recent Slack context"]
  H --> E
  B --> J["Prep modal intake"]
  J --> E
```

## Privacy Notes

- Beckett responds privately by default.
- Beckett does not post into the channel unless the user chooses to copy or send wording.
- Beckett does not store full Slack history by default.
- Beckett separates visible evidence from possible interpretation.
- Beckett does not infer diagnosis or hidden intent.
- Modal intake is used only to collect the context Beckett needs for the requested prep session.

## Demo Script

Opening: "Beckett is a neurodivergent workplace communication coach for Slack. It helps people prepare for high-stakes conversations, understand ambiguous tone, and respond clearly without over-apologizing or spiraling."

Demo:
1. Show the vague manager thread.
2. Click `Ask Beckett`.
3. Highlight that Beckett names visible evidence and uncertainty separately.
4. Show reply options.
5. Run `/beckett prep I need to talk to my manager about workload in my 1:1`.
6. Show the `Prep with Beckett` modal.
7. Submit context and show the coaching in the Slack Agent/Split View panel.
8. Show talking points, opening line, likely pushback, practice prompt, and follow-up draft.

Close: "Beckett helps neurodivergent workers communicate clearly inside the tools where work already happens."
