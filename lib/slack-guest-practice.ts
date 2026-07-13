import {
  buildBeckettPayload,
  lookupSlackWorkspaceBotToken,
  postSlackAgentMessage,
  runSlackGuestCoaching,
  slackApiPost,
} from "@/lib/slack-app";
import {
  loadSlackGuestPrepState,
  scheduleSlackInactivityStartCard,
  saveSlackGuestPracticeState,
} from "@/lib/slack-history";
import {
  claimSlackGuestPractice,
  loadSlackGuestSession,
  releaseSlackGuestPracticeClaim,
  startSlackGuestSession,
  updateSlackGuestSession,
} from "@/lib/slack-guest-session";

function guestPracticePersona(personAndSituation: string) {
  const text = personAndSituation.toLowerCase();
  if (/\b(manager|boss|supervisor)\b/.test(text)) return "your manager";
  if (/\b(client|customer)\b/.test(text)) return "your client";
  if (/\b(direct report|employee)\b/.test(text)) return "your direct report";
  if (/\b(teammate|coworker|colleague)\b/.test(text)) return "your teammate";
  const mention = personAndSituation.match(/<@([A-Z0-9]+)(?:\|([^>]+))?>/);
  return mention?.[2] || "the other person";
}

export async function startGuestPracticeFromPrep(input: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  prepThreadTs: string;
}) {
  let prepSession = await loadSlackGuestSession({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    channelId: input.channelId,
    threadTs: input.prepThreadTs,
  }).catch((error) => {
    console.warn("Slack Guest session table is unavailable during Practice handoff", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const botAccessToken = await lookupSlackWorkspaceBotToken(input.teamId);
  if (!botAccessToken) return { ok: false as const, error: "missing_bot_token" };

  if (prepSession?.practice_thread_ts) {
    const permalink = await slackApiPost<{ permalink?: string }>(botAccessToken, "chat.getPermalink", {
      channel: input.channelId,
      message_ts: prepSession.practice_thread_ts,
    });
    if (permalink.ok && permalink.permalink) {
      return { ok: true as const, channelId: input.channelId, threadTs: prepSession.practice_thread_ts, permalink: permalink.permalink };
    }
  }

  if (prepSession) {
    const claimed = await claimSlackGuestPractice(prepSession);
    if (!claimed) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const current = await loadSlackGuestSession({
          teamId: input.teamId,
          slackUserId: input.slackUserId,
          channelId: input.channelId,
          threadTs: input.prepThreadTs,
        });
        if (!current?.practice_thread_ts) continue;
        const permalink = await slackApiPost<{ permalink?: string }>(botAccessToken, "chat.getPermalink", {
          channel: input.channelId,
          message_ts: current.practice_thread_ts,
        });
        if (permalink.ok && permalink.permalink) {
          return { ok: true as const, channelId: input.channelId, threadTs: current.practice_thread_ts, permalink: permalink.permalink };
        }
      }
      return { ok: false as const, error: "practice_creation_in_progress" };
    }
    prepSession = claimed;
  }

  const prep = await loadSlackGuestPrepState({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    threadTs: input.prepThreadTs,
  });
  if (!prep?.person || !prep.location || !prep.outcome || !prep.concern) {
    if (prepSession) await releaseSlackGuestPracticeClaim(prepSession).catch(() => null);
    return { ok: false as const, error: "prep_incomplete" };
  }

  const persona = guestPracticePersona(prep.person);
  const mediumInstruction = prep.location === "written"
    ? "We’ll practice this message by message."
    : prep.location === "call"
      ? "We’ll practice it like a live call."
      : "We’ll practice it like an in-person conversation.";
  const opened = await postSlackAgentMessage({
    botAccessToken,
    slackUserId: input.slackUserId,
    title: "Practice conversation",
    text: [
      `I’ll play ${persona}. ${mediumInstruction}`,
      "Reply as yourself. I’ll stay in character until you say `pause`, `stop practice`, or ask for feedback.",
    ].join("\n\n"),
  });
  if (!opened.ok || !("ts" in opened) || !opened.ts || !opened.channelId) {
    if (prepSession) await releaseSlackGuestPracticeClaim(prepSession).catch(() => null);
    return { ok: false as const, error: "practice_thread_failed" };
  }

  if (prepSession) {
    prepSession = await updateSlackGuestSession(prepSession, { practice_thread_ts: opened.ts, status: "completed" });
  }

  await saveSlackGuestPracticeState({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    state: {
      threadTs: opened.ts,
      prepThreadTs: input.prepThreadTs,
      person: persona,
      location: prep.location,
      outcome: prep.outcome,
      concern: prep.concern,
    },
  });
  await startSlackGuestSession({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    channelId: opened.channelId,
    threadTs: opened.ts,
    flowType: "practice",
    state: { prepThreadTs: input.prepThreadTs, person: persona, location: prep.location, outcome: prep.outcome, concern: prep.concern },
  }).catch(() => null);
  const opening = await runSlackGuestCoaching({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
    action: "agent_message",
    intent: "practice",
    messageText: `Practice role-play with ${persona}.\nDesired outcome: ${prep.outcome}\nConcern or likely pushback: ${prep.concern}`,
    prompt: [
      `Begin a role-play as ${persona}.`,
      `Conversation location: ${mediumInstruction}`,
      `The user's desired outcome: ${prep.outcome}`,
      `Likely concern or pushback: ${prep.concern}`,
      "Give only one short, neutral opening line that hands the conversation to the user.",
      "Do not assume small talk or invent what the user said. Do not coach, explain, summarize, or ask if the user is ready.",
    ].join("\n"),
  });
  const posted = await slackApiPost(botAccessToken, "chat.postMessage", {
    channel: opened.channelId,
    thread_ts: opened.ts,
    ...buildBeckettPayload({ title: "Beckett", body: opening, footer: "Guest mode • Connect Beckett for personalized context.", hideTitle: true }),
  });
  if (posted.ok) {
    await scheduleSlackInactivityStartCard({ botAccessToken, channelId: opened.channelId }).catch((error) => {
      console.error("Slack Practice inactivity start card failed", error);
    });
  }
  const permalink = await slackApiPost<{ permalink?: string }>(botAccessToken, "chat.getPermalink", {
    channel: opened.channelId,
    message_ts: opened.ts,
  });
  return { ok: true as const, channelId: opened.channelId, threadTs: opened.ts, permalink: permalink.permalink || null };
}
