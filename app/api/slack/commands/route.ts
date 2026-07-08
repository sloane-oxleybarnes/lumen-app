import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  lookupSlackWorkspaceBotToken,
  postSlackResponse,
  runSlackGuestCoaching,
  scheduleSlackBackgroundTask,
  verifySlackRequest,
} from "@/lib/slack-app";
import { startGuidedSlackFlow } from "@/lib/slack-guided-prep";

export const runtime = "nodejs";

type SlackCoachingIntent = "respond" | "rewrite" | "decode" | "prep" | "practice";

type SlashCommandPayload = {
  team_id?: string;
  user_id?: string;
  channel_id?: string;
  channel_name?: string;
  text?: string;
  command?: string;
  response_url?: string;
  ssl_check?: string;
};

type ParsedSlackCommand =
  | { ok: true; intent: SlackCoachingIntent; prompt: string }
  | { ok: false; message: string };

const slashSubcommands: Record<string, { intent: SlackCoachingIntent; missingText: string }> = {
  respond: {
    intent: "respond",
    missingText: "Add what you need help responding to after `/beckett respond`.",
  },
  rewrite: {
    intent: "rewrite",
    missingText: 'Add the draft message after `/beckett rewrite`, like `/beckett rewrite "Any update on this?"`.',
  },
  decode: {
    intent: "decode",
    missingText: 'Add the message you want Beckett to decode, like `/beckett decode "Sure, sounds fine."`.',
  },
  prep: {
    intent: "prep",
    missingText: "Add the conversation you want to prepare for after `/beckett prep`.",
  },
  practice: {
    intent: "practice",
    missingText: "Add the conversation you want to practice after `/beckett practice`.",
  },
};

const removedSlashSubcommands = new Set(["draft", "clarity", "boundary", "followup", "tone", "follow-up"]);

function parseSlashCommand(rawBody: string): SlashCommandPayload {
  const params = new URLSearchParams(rawBody);
  return {
    team_id: params.get("team_id") || undefined,
    user_id: params.get("user_id") || undefined,
    channel_id: params.get("channel_id") || undefined,
    channel_name: params.get("channel_name") || undefined,
    text: params.get("text") || "",
    command: params.get("command") || undefined,
    response_url: params.get("response_url") || undefined,
    ssl_check: params.get("ssl_check") || undefined,
  };
}

function helpPayload(command = "/beckett") {
  return buildBeckettPayload({
    title: "Beckett",
    subtitle: "Communication coach",
    body: [
      "Use Beckett when a Slack message feels unclear, a reply needs careful wording, or you want to prepare for a workplace conversation.",
      "",
      "Try these:",
      `${command} respond help me answer this without sounding defensive`,
      `${command} rewrite "Any update on this?"`,
      `${command} decode "Sure, sounds fine."`,
      `${command} prep I need to tell a teammate their handoffs are too vague`,
      `${command} practice my 1:1 with my manager about workload`,
      "",
      "For a specific Slack message, use the message shortcut: Ask Beckett about this message.",
    ].join("\n"),
  });
}

function parseBeckettText(rawText: string): ParsedSlackCommand {
  const text = rawText.trim();
  const match = text.match(/^([a-z][a-z-]*):?\s*([\s\S]*)$/i);
  const command = match?.[1]?.toLowerCase();

  if (command && removedSlashSubcommands.has(command)) {
    return {
      ok: false,
      message:
        "That Beckett Slack mode has moved. Use `/beckett respond`, `/beckett rewrite`, `/beckett decode`, `/beckett prep`, or `/beckett practice`.",
    };
  }

  const definition = command ? slashSubcommands[command] : null;
  if (!definition) {
    return {
      ok: false,
      message:
        "Start with one of Beckett’s Slack modes: `/beckett respond`, `/beckett rewrite`, `/beckett decode`, `/beckett prep`, or `/beckett practice`.",
    };
  }

  const prompt = (match?.[2] || "").trim();
  if (!prompt) return { ok: false, message: definition.missingText };

  return { ok: true, intent: definition.intent, prompt };
}

async function startSidebarFlow({
  origin,
  payload,
  parsed,
}: {
  origin: string;
  payload: SlashCommandPayload;
  parsed: Extract<ParsedSlackCommand, { ok: true }>;
}) {
  const responseUrl = payload.response_url || "";

  try {
    if (!payload.team_id || !payload.user_id) {
      await postSlackResponse(responseUrl, "Beckett could not read the Slack workspace and user context.", {
        replaceOriginal: true,
      });
      return;
    }

    const user = await lookupSlackConnectedUser(payload.team_id, payload.user_id);
    if (!user) {
      if (parsed.intent === "decode" || parsed.intent === "respond" || parsed.intent === "rewrite") {
        const botAccessToken = await lookupSlackWorkspaceBotToken(payload.team_id).catch((error) => {
          console.error("Slack workspace bot token lookup for guest slash failed", {
            teamPresent: Boolean(payload.team_id),
            slackUserPresent: Boolean(payload.user_id),
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
        if (botAccessToken) {
          const response = await runSlackGuestCoaching({
            teamId: payload.team_id,
            slackUserId: payload.user_id,
            action: "slash_command",
            prompt: parsed.prompt,
            messageText: parsed.prompt,
            intent: parsed.intent,
          });
          const guestPayload = buildBeckettPayload({
            title: "Beckett",
            subtitle: "",
            prompt: parsed.prompt,
            body: response,
            footer: "Connect Slack in Beckett Settings to use your coaching profile, contact context, broader Slack history, and saved conversations.",
            hideTitle: true,
          });
          await postSlackResponse(responseUrl, guestPayload.text, {
            blocks: guestPayload.blocks,
            replaceOriginal: true,
          });
          return;
        }
      }

      await postSlackResponse(
        responseUrl,
        [
          parsed.intent === "prep" || parsed.intent === "practice"
            ? "Prep and practice use your Beckett profile and saved coaching setup."
            : "I could not match this Slack account to a Beckett beta profile yet.",
          "",
          `Connect Slack from Beckett Settings, then try again: <${origin}/dashboard/settings|Open Beckett Settings>`,
        ].join("\n"),
        { replaceOriginal: true }
      );
      return;
    }

    if (!isAllowedSlackPlan(user)) {
      await postSlackResponse(responseUrl, "Beckett Slack coaching is available for beta and pro users.", {
        replaceOriginal: true,
      });
      return;
    }

    if (!user.botAccessToken) {
      await postSlackResponse(
        responseUrl,
        "Beckett could not start the private assistant conversation because the Slack bot token is missing. Reinstall the Slack app, then reconnect Slack in Beckett Settings.",
        { replaceOriginal: true }
      );
      return;
    }

    const started = await startGuidedSlackFlow({
      user,
      teamId: payload.team_id,
      slackUserId: payload.user_id,
      intent: parsed.intent,
      prompt: parsed.prompt,
      sourceChannelId: payload.channel_id,
      sourceChannelName: payload.channel_name,
    });

    if (!started.ok) {
      await postSlackResponse(
        responseUrl,
        "Beckett could not start the private assistant conversation. Open Beckett in Slack and try again there.",
        { replaceOriginal: true }
      );
      return;
    }

    await postSlackResponse(responseUrl, "I started this in our private conversation.", {
      replaceOriginal: true,
    });
  } catch (error) {
    console.error("Slack sidebar flow start failed", {
      intent: parsed.intent,
      message: error instanceof Error ? error.message : String(error),
    });
    await postSlackResponse(responseUrl, `Beckett could not finish that request: ${handleSlackAiError(error)}`, {
      replaceOriginal: true,
    });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseSlashCommand(rawBody);
  if (payload.ssl_check === "1") return NextResponse.json({ ok: true });

  const text = payload.text?.trim() || "";
  if (!text) {
    const help = helpPayload(payload.command);
    return NextResponse.json({
      response_type: "ephemeral",
      text: help.text,
      blocks: help.blocks,
    });
  }

  const parsed = parseBeckettText(text);
  if (!parsed.ok) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: parsed.message,
    });
  }

  if (!payload.response_url) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Beckett could not start this because Slack did not include a response URL.",
    });
  }

  scheduleSlackBackgroundTask(
    "Slack sidebar flow start failed",
    startSidebarFlow({
      origin: req.nextUrl.origin,
      payload,
      parsed,
    })
  );

  return NextResponse.json({
    response_type: "ephemeral",
    text: "I’m starting this in our private conversation.",
  });
}
