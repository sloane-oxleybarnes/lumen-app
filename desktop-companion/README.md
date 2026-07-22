# Beckett Desktop Companion (Mac-first)

This isolated Electron application is the starting point for Beckett's user-invoked desktop overlay. It deliberately does not share runtime code with Slack, the browser extension, or the adaptive-conversation simulator.

## Current behavior

- `Command+Shift+B` shows or hides the companion.
- A user can pull copied text into the companion, then open Beckett's staging Personal workspace to decode or draft.
- A Zoom-ready meeting session shell presents the required consent reminder and opens the web Meeting Companion for voluntary notes/debriefs.
- It does **not** capture audio, screen contents, or transcripts.

## Local setup

```bash
cd desktop-companion
npm install --save-dev electron electron-builder
npm start
```

Set `BECKETT_SITE_URL` to point to a different Beckett deployment if needed. Mac packaging and notarization are release dependencies; an Apple Developer Program membership and signing credentials are required before distributing a signed/notarized build.
