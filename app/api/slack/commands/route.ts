import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { buildGuestSlashCoachingPrompt } from "@/lib/slack-guest-routing";

export const runtime = "nodejs";

type SlackCoachingIntent = "respond" | "rewrite" | "decode" | "prep" | "practice";

type SlashCommandPayload = {
  api_app_id?: string;
  team_id?: string;
  team_domain?: string;
  user_id?: string;
  channel_id?: string;
  channel_name?: string;
  text?: string;
  command?: string;
  response_url?: string;
  ssl_check?: string;
};

type ParsedSlackCommand =
  | { ok: true; intent: SlackCoachingIntent; prompt: string; useLatestSourceMessage?: boolean }
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
    api_app_id: params.get("api_app_id") || undefined,
    team_id: params.get("team_id") || undefined,
    team_domain: params.get("team_domain") || undefined,
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
  const text = [
    "Use Beckett when a Slack message feels unclear, a reply needs careful wording, or you want to prepare for a workplace conversation.",
    "",
    "Try these:",
    `${command} respond`,
    `${command} rewrite "Any update on this?"`,
    `${command} decode`,
    `${command} prep I need to tell a teammate their handoffs are too vague`,
    `${command} practice my 1:1 with my manager about workload`,
    "",
    "For a specific Slack message, use the message shortcuts: Beckett - Decode or Beckett - Respond.",
  ].join("\n");
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ],
  };
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function verifySlackCommandRequest(req: NextRequest, rawBody: string) {
  const signingSecrets = [
    process.env.SLACK_SIGNING_SECRET,
    process.env.SLACK_STAGING_SIGNING_SECRET,
    process.env.SLACK_PRODUCTION_SIGNING_SECRET,
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (!signingSecrets.length) {
    return { ok: false as const, status: 500, message: "Slack signing secret is not configured." };
  }

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const timestampNumber = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(timestampNumber)) {
    return { ok: false as const, status: 401, message: "Missing Slack signature." };
  }

  if (Math.abs(Date.now() / 1000 - timestampNumber) > 60 * 5) {
    return { ok: false as const, status: 401, message: "Slack request is too old." };
  }

  const signedPayload = `v0:${timestamp}:${rawBody}`;
  const verified = signingSecrets.some((signingSecret) => {
    const expectedSignature = `v0=${createHmac("sha256", signingSecret).update(signedPayload).digest("hex")}`;
    return safeCompare(signature, expectedSignature);
  });
  if (!verified) {
    return {
      ok: false as const,
      status: 401,
      message: `Invalid Slack signature. Checked ${signingSecrets.length} configured signing secret${signingSecrets.length === 1 ? "" : "s"}.`,
    };
  }

  return { ok: true as const };
}

function scheduleCommandBackgroundTask(label: string, task: Promise<void>) {
  const handledTask = task.catch((error) => {
    console.error(label, error);
  });
  const requestContext = (globalThis as { [key: symbol]: { get?: () => { waitUntil?: (task: Promise<unknown>) => void } | undefined } | undefined })[
    Symbol.for("@vercel/request-context")
  ];
  const context = requestContext?.get?.();
  if (context?.waitUntil) context.waitUntil(handledTask);
  else void handledTask;
}

async function scheduleGuestInactivityStartCard({
  botAccessToken,
  channelId,
}: {
  botAccessToken: string;
  channelId: string;
}) {
  const { scheduleSlackInactivityStartCard } = await import("@/lib/slack-history");
  await scheduleSlackInactivityStartCard({
    botAccessToken,
    channelId,
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
  if (!prompt) {
    if (definition.intent === "decode" || definition.intent === "respond") {
      return {
        ok: true,
        intent: definition.intent,
        prompt:
          definition.intent === "decode"
            ? "Decode the latest relevant message in this Slack conversation."
            : "Draft a response to the latest relevant message in this Slack conversation.",
        useLatestSourceMessage: true,
      };
    }
    return { ok: false, message: definition.missingText };
  }

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
    const {
      buildBeckettPayload,
      buildGuestSlackContextPacket,
      fetchLatestSlackMessageContext,
      isAllowedSlackPlan,
      lookupSlackConnectedUser,
      lookupSlackWorkspaceBotToken,
      postSlackAgentMessage,
      postSlackResponse,
      runSlackGuestCoaching,
      slackApiPost,
    } = await import("@/lib/slack-app");
    const { startGuidedSlackFlow } = await import("@/lib/slack-guided-prep");

    if (!payload.team_id || !payload.user_id) {
      await postSlackResponse(responseUrl, "Beckett could not read the Slack workspace and user context.", {
        replaceOriginal: true,
      });
      return;
    }

    const user = await lookupSlackConnectedUser(payload.team_id, payload.user_id);
    if (!user) {
      const botAccessToken = await lookupSlackWorkspaceBotToken(payload.team_id).catch((error) => {
        console.error("Slack workspace bot token lookup for guest slash failed", {
          teamPresent: Boolean(payload.team_id),
          slackUserPresent: Boolean(payload.user_id),
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (botAccessToken) {
        const latestSource = parsed.useLatestSourceMessage
          ? await fetchLatestSlackMessageContext({
              accessToken: botAccessToken,
              channelId: payload.channel_id,
              channelName: payload.channel_name,
              currentSlackUserId: payload.user_id,
            })
          : null;
        const latestSourcePrompt = latestSource?.targetText
          ? [
              parsed.prompt,
              "",
              "Target latest Slack message:",
              latestSource.targetText,
            ].join("\n")
          : parsed.prompt;
        const guestContext = await buildGuestSlackContextPacket({
          botAccessToken,
          channelId: payload.channel_id,
          channelName: payload.channel_name,
          latestMessageText: latestSource?.targetText,
          selectedMessageTs: latestSource?.targetTs,
          userRequest: latestSourcePrompt,
          currentSlackUserId: payload.user_id,
        });
        const coachingPrompt = buildGuestSlashCoachingPrompt(parsed.intent, parsed.prompt, latestSource?.targetText);
        const coachingMessageText = guestContext.text || latestSource?.context?.text || latestSource?.targetText || parsed.prompt;
        let response = "";
        const opener =
          parsed.intent === "decode"
            ? "Let’s read this message privately."
            : parsed.intent === "respond"
              ? "Let’s draft a response privately."
              : parsed.intent === "rewrite"
                ? "Let’s clean up this wording privately."
                : parsed.intent === "practice"
                  ? "Let’s practice this conversation privately."
                  : "Let’s prep this conversation privately.";
        const guidance =
          parsed.intent === "decode"
            ? "Reply in this thread so I can keep this message, read, and follow-ups saved together."
            : parsed.intent === "respond"
              ? "Reply in this thread so I can keep this message, drafts, and follow-ups saved together."
              : "Reply in this thread so I can keep the setup and follow-ups saved together.";
        const agentDelivery = await postSlackAgentMessage({
          botAccessToken,
          slackUserId: payload.user_id,
          title: `${parsed.intent[0].toUpperCase()}${parsed.intent.slice(1)}: Slack conversation`,
          text: [opener, "", guidance].join("\n\n"),
        });

        let agentReplyPosted = false;
        let agentChannelId: string | null = null;
        if (agentDelivery.ok && "channelId" in agentDelivery && "ts" in agentDelivery && agentDelivery.channelId && agentDelivery.ts) {
          agentChannelId = agentDelivery.channelId;
          const { startSlackGuestSession, updateSlackGuestSession } = await import("@/lib/slack-guest-session");
          const source = latestSource?.targetText
            ? {
                channelId: payload.channel_id,
                channelName: payload.channel_name,
                messageTs: latestSource.targetTs || undefined,
                message: latestSource.targetText,
                context: guestContext.text || latestSource.context?.text || undefined,
              }
            : undefined;
          let state: Record<string, unknown> = { step: "active" };
          if (parsed.intent === "rewrite") state = { step: "active", draft: parsed.prompt };
          let prepResponse: string | null = null;
          if (parsed.intent === "prep") {
            const location: "written" | "call" | "in_person" | undefined = /\b(slack|message|dm|email|written|text)\b/i.test(parsed.prompt)
              ? "written"
              : /\b(zoom|meet|video|phone|call|virtual)\b/i.test(parsed.prompt)
                ? "call"
                : /\b(in[ -]?person|face[ -]?to[ -]?face|office|coffee)\b/i.test(parsed.prompt)
                  ? "in_person"
                  : undefined;
            const prepState = {
              threadTs: agentDelivery.ts,
              step: location ? "outcome" as const : "location" as const,
              person: parsed.prompt,
              location,
            };
            const { saveSlackGuestPrepState } = await import("@/lib/slack-history");
            await saveSlackGuestPrepState({ teamId: payload.team_id, slackUserId: payload.user_id, state: prepState });
            state = prepState;
            prepResponse = location
              ? "What outcome do you want from the conversation? What would a good result look like?"
              : "Where will this conversation happen—Slack or another written message, a video or phone call, or in person?";
          }
          let guestSession = await startSlackGuestSession({
            teamId: payload.team_id,
            slackUserId: payload.user_id,
            channelId: agentDelivery.channelId,
            threadTs: agentDelivery.ts,
            flowType: parsed.intent,
            source,
            state,
            transcript: [{ role: "user", content: parsed.prompt }],
          }).catch((error) => {
            console.error("Slack guest slash session start failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return null;
          });
          response = prepResponse || await runSlackGuestCoaching({
            teamId: payload.team_id,
            slackUserId: payload.user_id,
            action: "slash_command",
            prompt: coachingPrompt,
            messageText: coachingMessageText,
            intent: parsed.intent,
          });
          if (guestSession) {
            guestSession = await updateSlackGuestSession(guestSession, {
              artifacts: { ...guestSession.artifacts, latestResponse: response },
              transcript: [
                ...guestSession.transcript,
                { role: "beckett", content: response },
              ],
            }).catch((error) => {
              console.error("Slack guest slash session result save failed", {
                message: error instanceof Error ? error.message : String(error),
              });
              return guestSession;
            });
          }
          const responsePayload = buildBeckettPayload({
            title: "Beckett",
            subtitle: "",
            body: response,
            hideTitle: true,
          });
          const reply = await slackApiPost(botAccessToken, "chat.postMessage", {
            channel: agentDelivery.channelId,
            thread_ts: agentDelivery.ts,
            ...responsePayload,
          });
          agentReplyPosted = Boolean(reply.ok);
          if (!agentReplyPosted) {
            console.error("Slack guest slash assistant reply failed", {
              teamPresent: Boolean(payload.team_id),
              slackUserPresent: Boolean(payload.user_id),
              error: reply.error || "agent_reply_failed",
            });
          }
        }

        if (agentReplyPosted) {
          if (agentChannelId) {
            scheduleCommandBackgroundTask(
              "Slack guest slash inactivity start card failed",
              scheduleGuestInactivityStartCard({
                botAccessToken,
                channelId: agentChannelId,
              })
            );
          }
          await postSlackResponse(responseUrl, "I moved this into our private Beckett conversation.", {
            replaceOriginal: true,
          });
          return;
        }

        if (!response) {
          response = await runSlackGuestCoaching({
            teamId: payload.team_id,
            slackUserId: payload.user_id,
            action: "slash_command",
            prompt: coachingPrompt,
            messageText: coachingMessageText,
            intent: parsed.intent,
          });
        }
        const guestPayload = buildBeckettPayload({
          title: "Beckett",
          subtitle: "",
          body: [
            "I prepared this privately here because the Beckett coach panel was not available.",
            "",
            response,
          ].join("\n"),
          footer: "Guest mode is on for judging. Connecting Slack adds profile, contacts, history, and saved conversations.",
          hideTitle: true,
        });
        await postSlackResponse(responseUrl, guestPayload.text, {
          blocks: guestPayload.blocks,
          replaceOriginal: true,
        });
        return;
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

    const latestSource = parsed.useLatestSourceMessage
      ? await fetchLatestSlackMessageContext({
          accessToken: user.accessToken,
          channelId: payload.channel_id,
          channelName: payload.channel_name,
          currentSlackUserId: payload.user_id,
        })
      : null;
    const latestSourcePrompt = latestSource?.targetText
      ? [
          parsed.prompt,
          "",
          "Target latest Slack message:",
          latestSource.targetText,
        ].join("\n")
      : parsed.prompt;

    const started = await startGuidedSlackFlow({
      user,
      teamId: payload.team_id,
      slackUserId: payload.user_id,
      intent: parsed.intent,
      prompt: latestSourcePrompt,
      sourceChannelId: payload.channel_id,
      sourceChannelName: payload.channel_name,
      sourceThreadTs: latestSource?.targetTs || undefined,
      sourceActiveContext: latestSource?.context || undefined,
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
    const { handleSlackAiError, postSlackResponse } = await import("@/lib/slack-app");
    await postSlackResponse(responseUrl, `Beckett could not finish that request: ${handleSlackAiError(error)}`, {
      replaceOriginal: true,
    });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackCommandRequest(req, rawBody);
  if (!verification.ok) {
    const payload = parseSlashCommand(rawBody);
    console.error("Slack slash command verification failed", {
      status: verification.status,
      message: verification.message,
      apiAppId: payload.api_app_id || null,
      teamId: payload.team_id || null,
      teamDomain: payload.team_domain || null,
      command: payload.command || null,
      channelId: payload.channel_id || null,
      hasTimestamp: Boolean(req.headers.get("x-slack-request-timestamp")),
      hasSignature: Boolean(req.headers.get("x-slack-signature")),
    });
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseSlashCommand(rawBody);
  console.info("Slack slash command verified", {
    apiAppId: payload.api_app_id || null,
    teamId: payload.team_id || null,
    teamDomain: payload.team_domain || null,
    command: payload.command || null,
    channelId: payload.channel_id || null,
  });

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

  scheduleCommandBackgroundTask(
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
