import { NextRequest, NextResponse } from "next/server";
import {
  buildBeckettPayload,
  buildSlackCoachingContext,
  configureSlackAgentSurface,
  fetchSlackConversationContext,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  lookupSlackWorkspaceBotToken,
  resolveSlackAuthorRelationshipContext,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackApiPost,
  slackConnectText,
  verifySlackRequest,
} from "@/lib/slack-app";
import { handleGuidedSlackPrep } from "@/lib/slack-guided-prep";
import { postSlackMessagesLanding, publishSlackConnectHome, publishSlackHomeResult } from "@/lib/slack-history";
import { supabaseAdmin } from "@/lib/server-admin";

export const runtime = "nodejs";

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    tab?: string;
    channel_type?: string;
    channel?: string;
    user?: string;
    bot_id?: string;
    subtype?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    action_token?: string;
    context?: {
      entities?: Array<{
        type?: string;
        value?: string;
        team_id?: string;
      }>;
    };
  };
};

function extractActiveSlackContext(event: NonNullable<SlackEventEnvelope["event"]>) {
  const channelEntity = event.context?.entities?.find((entity) =>
    entity.type?.includes("channel_id") && entity.value
  );
  const userEntity = event.context?.entities?.find((entity) =>
    entity.type?.includes("user_id") && entity.value
  );
  return {
    channelId: channelEntity?.value || null,
    userId: userEntity?.value || null,
    actionToken: event.action_token || null,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody || "{}") as SlackEventEnvelope;

  if (body.type === "url_verification" && body.challenge) {
    return new NextResponse(body.challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const event = body.event;
  if (
    body.type === "event_callback" &&
    event?.type === "app_home_opened" &&
    event.user
  ) {
    if (!event.tab || event.tab === "home") {
      scheduleSlackBackgroundTask(
        "Slack app home publish failed",
        publishHome({
          teamId: body.team_id || "",
          slackUserId: event.user,
        })
      );
    }

    if (!event.tab || event.tab === "messages") {
      scheduleSlackBackgroundTask(
        "Slack agent surface setup failed",
        setupMessagesSurface({
          teamId: body.team_id || "",
          slackUserId: event.user,
          channelId: event.channel,
        })
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.type !== "event_callback" ||
    event?.type !== "message" ||
    event.channel_type !== "im" ||
    !event.user ||
    !event.channel ||
    !event.text ||
    event.bot_id ||
    event.subtype
  ) {
    return NextResponse.json({ ok: true });
  }

  const activeSlackContext = extractActiveSlackContext(event);
  scheduleSlackBackgroundTask(
    "Slack agent message response failed",
    respondToAgentMessage({
      teamId: body.team_id || "",
      slackUserId: event.user,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts || "",
      text: event.text,
      activeChannelId: activeSlackContext.channelId,
      activeUserId: activeSlackContext.userId,
      actionToken: activeSlackContext.actionToken,
    })
  );

  return NextResponse.json({ ok: true });
}

async function shouldPostMessagesLanding(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_integrations")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .maybeSingle();

  if (error) throw error;
  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const lastPosted = typeof metadata.messages_landing_posted_at === "string"
    ? new Date(metadata.messages_landing_posted_at).getTime()
    : 0;
  if (Number.isFinite(lastPosted) && Date.now() - lastPosted < 10 * 60 * 1000) return false;

  await supabaseAdmin
    .from("user_integrations")
    .update({
      metadata: {
        ...metadata,
        messages_landing_posted_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "slack");

  return true;
}

async function setupMessagesSurface({
  teamId,
  slackUserId,
  channelId,
}: {
  teamId: string;
  slackUserId: string;
  channelId?: string;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken || !isAllowedSlackPlan(user)) return;

  await configureSlackAgentSurface({
    botAccessToken: user.botAccessToken,
    slackUserId,
    channelId,
  });

  if (!(await shouldPostMessagesLanding(user.id))) return;

  await postSlackMessagesLanding({
    botAccessToken: user.botAccessToken,
    slackUserId,
    userName: user.name,
    channelId,
  });
}

async function publishHome({
  teamId,
  slackUserId,
}: {
  teamId: string;
  slackUserId: string;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken || !isAllowedSlackPlan(user)) {
    const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
      console.error("Slack workspace bot token lookup for Home failed", {
        teamPresent: Boolean(teamId),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    await publishSlackConnectHome({
      botAccessToken,
      slackUserId,
      settingsUrl: "https://www.meetbeckett.co/dashboard/settings",
    });
    return;
  }

  await publishSlackHomeResult({
    botAccessToken: user.botAccessToken,
    slackUserId,
    userId: user.id,
  });
}

async function respondToAgentMessage({
  teamId,
  slackUserId,
  channelId,
  threadTs,
  text,
  activeChannelId,
  activeUserId,
  actionToken,
}: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  text: string;
  activeChannelId?: string | null;
  activeUserId?: string | null;
  actionToken?: string | null;
}) {
  const user = await lookupSlackConnectedUser(teamId, slackUserId);
  if (!user?.botAccessToken) {
    const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
      console.error("Slack workspace bot token lookup failed", {
        teamPresent: Boolean(teamId),
        slackUserPresent: Boolean(slackUserId),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (botAccessToken) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "Connect Slack",
        body: slackConnectText("https://www.meetbeckett.co", "I can see this Slack workspace, but I could not match your Slack account to a Beckett profile yet."),
      });

      await slackApiPost(botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });
      return;
    }

    console.error("Slack agent message ignored because no connected user or workspace bot token was found", {
      teamPresent: Boolean(teamId),
      slackUserPresent: Boolean(slackUserId),
      channelPresent: Boolean(channelId),
    });
    return;
  }

  if (!isAllowedSlackPlan(user)) {
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      text: "Beckett Slack coaching is available for beta and pro users.",
    });
    return;
  }

  try {
    await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "thinking through the conversation...",
    }).catch(() => null);

    const activeContext = activeChannelId
      ? await fetchSlackConversationContext({
          accessToken: user.accessToken,
          channelId: activeChannelId,
        })
      : null;
    const activeRelationship = await resolveSlackAuthorRelationshipContext({
      user,
      teamId,
      slackAuthorUserId: activeUserId,
      interactionType: "slack_agent_message",
    });
    const relationshipNote =
      activeRelationship && !activeRelationship.linked && activeRelationship.slackIdentifier
        ? `Add confirmed Slack ID ${activeRelationship.slackIdentifier} to this person's Beckett contact to use relationship context next time.`
        : "";

    const guidedPrep = await handleGuidedSlackPrep({
      user,
      teamId,
      slackUserId,
      channelId,
      threadTs,
      text,
      activeChannelId,
      activeContext,
      relationshipContext: activeRelationship?.promptContext || null,
      actionToken,
    });

    if (guidedPrep.handled) {
      const payload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        body: guidedPrep.response,
        actions: guidedPrep.actions,
      });

      await slackApiPost(user.botAccessToken, "chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        ...payload,
      });

      await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
        channel_id: channelId,
        thread_ts: threadTs,
        status: "",
      }).catch(() => null);
      return;
    }

    const coachingContext = await buildSlackCoachingContext({
      user,
      prompt: text,
      activeContext,
      contextChannelId: activeChannelId,
      actionToken,
    });

    const response = await runSlackCoaching({
      user,
      action: "agent_message",
      prompt: text,
      sourceLabel: "slack_agent_message",
      messageText: coachingContext.text,
      contextStatus: coachingContext.status,
      contextFailureReason: coachingContext.failureReason,
      contextMessageCount: coachingContext.messageCount,
      broaderSearchUsed: coachingContext.broaderSearchUsed,
      relationshipContext: activeRelationship?.promptContext || null,
      intent: "general",
      responseDetail: "longer",
    });
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Communication coach",
      prompt: text,
      body: response,
      footer: [
        coachingContext.broaderSearchUsed ? "Used relevant Slack history for context." : "",
        relationshipNote,
      ].filter(Boolean).join("\n") || undefined,
    });

    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      ...payload,
    });

    await slackApiPost(user.botAccessToken, "assistant.threads.setStatus", {
      channel_id: channelId,
      thread_ts: threadTs,
      status: "",
    }).catch(() => null);
  } catch (error) {
    const payload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Could not finish that request",
      body: handleSlackAiError(error),
    });
    await slackApiPost(user.botAccessToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      ...payload,
    });
  }
}
