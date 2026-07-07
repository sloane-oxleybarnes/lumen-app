import { NextRequest, NextResponse } from "next/server";
import {
  buildAskedResponsePayload,
  buildBeckettPayload,
  buildSlackCoachingContext,
  fetchSlackConversationContext,
  handleSlackAiError,
  isAllowedSlackPlan,
  lookupSlackConnectedUser,
  lookupSlackWorkspaceBotToken,
  postSlackAgentMessage,
  postSlackResponse,
  resolveSlackAuthorRelationshipContext,
  runSlackGuestCoaching,
  runSlackCoaching,
  scheduleSlackBackgroundTask,
  slackApiPost,
  slackConnectText,
  slackContextUserNote,
  SlackBlock,
  SlackCoachingIntent,
  SLACK_SLASH_LONGER_ACTION_ID,
  SLACK_SLASH_QUICK_ACTION_ID,
  SlackResponseDetail,
  setSlackAgentSuggestedPrompts,
  verifySlackRequest,
} from "@/lib/slack-app";
import {
  createSlackDraftActionSession,
  SLACK_DRAFT_CANCEL_ACTION_ID,
  SLACK_DRAFT_SEND_ACTION_ID,
  SLACK_DRAFT_USE_ACTION_ID,
  startGuidedSlackFlow,
  SlackDraftOption,
} from "@/lib/slack-guided-prep";
import {
  archiveSlackCoachingThread,
  appendSlackCoachingMessage,
  buildSlackHistoryContinuePayload,
  cleanupSlackCoachingBotMessages,
  createSlackCoachingThread,
  loadSlackCoachingMessages,
  loadSlackCoachingThread,
  parseSlackHistoryAction,
  publishSlackHome,
  recordSlackCoachingBotMessage,
  slackHistoryTitle,
  SLACK_HISTORY_ARCHIVE_ACTION_ID,
  SLACK_HISTORY_CONTINUE_ACTION_ID,
  SLACK_HISTORY_QUICK_ACTION_ID,
  SlackHistoryFlowType,
  summarizeSlackCoachingResponse,
} from "@/lib/slack-history";
import { supabaseAdmin } from "@/lib/server-admin";

export const runtime = "nodejs";

type SlackInteractionPayload = {
  type?: string;
  callback_id?: string;
  response_url?: string;
  team?: { id?: string; domain?: string };
  user?: { id?: string; username?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: Record<
        string,
        Record<
          string,
          {
            type?: string;
            value?: string;
            selected_user?: string;
            selected_conversation?: string;
            selected_option?: { value?: string; text?: { text?: string } };
          }
        >
      >;
    };
  };
  message?: {
    text?: string;
    user?: string;
    username?: string;
    ts?: string;
    thread_ts?: string;
    attachments?: Array<{ text?: string; fallback?: string }>;
  };
  channel?: { id?: string; name?: string };
};

type SlackDraftActionValue = {
  sessionId?: string;
  optionId?: SlackDraftOption["id"];
};

type SlackPendingRequest = {
  id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  prompt: string;
  response_url: string | null;
  expires_at: string;
  completed_at: string | null;
};

function parseInteractionPayload(rawBody: string): SlackInteractionPayload | null {
  const params = new URLSearchParams(rawBody);
  const payload = params.get("payload");
  if (!payload) return null;
  try {
    return JSON.parse(payload) as SlackInteractionPayload;
  } catch {
    return null;
  }
}

function buildShortcutPrompt(payload: SlackInteractionPayload, authorLabel?: string | null) {
  const channel =
    payload.channel?.name && payload.channel.name !== "directmessage"
      ? `#${payload.channel.name}`
      : "this DM";
  const author = authorLabel || payload.message?.username || payload.message?.user || "the other person";
  return [
    `Help me understand this message from ${author} in ${channel}.`,
    "What might be happening underneath it, what should I pay attention to, and what could I say next?",
  ].join(" ");
}

function extractMessageText(payload: SlackInteractionPayload) {
  const mainText = payload.message?.text?.trim();
  if (mainText) return mainText;

  const attachmentText = payload.message?.attachments
    ?.map((attachment) => attachment.text || attachment.fallback || "")
    .join("\n")
    .trim();

  return attachmentText || "";
}

function parseSlashActionValue(value: string): { requestId: string; intent: SlackCoachingIntent } | null {
  try {
    const parsed = JSON.parse(value) as { requestId?: unknown; intent?: unknown };
    if (typeof parsed.requestId !== "string") return null;
    const validIntents: SlackCoachingIntent[] = [
      "rewrite",
      "decode",
      "draft",
      "prep",
      "tone",
      "followup",
      "respond",
      "clarity",
      "boundary",
      "practice",
    ];
    const intent = validIntents.includes(parsed.intent as SlackCoachingIntent)
      ? (parsed.intent as SlackCoachingIntent)
      : "general";

    return { requestId: parsed.requestId, intent };
  } catch {
    return { requestId: value, intent: "general" };
  }
}

function getSlashDetailAction(payload: SlackInteractionPayload) {
  const action = payload.actions?.find((item) =>
    item.action_id === SLACK_SLASH_QUICK_ACTION_ID || item.action_id === SLACK_SLASH_LONGER_ACTION_ID
  );
  if (!action?.value || !action.action_id) return null;
  const parsedValue = parseSlashActionValue(action.value);
  if (!parsedValue) return null;

  return {
    requestId: parsedValue.requestId,
    intent: parsedValue.intent,
    responseDetail: action.action_id === SLACK_SLASH_LONGER_ACTION_ID ? "longer" : "quick",
  } satisfies { requestId: string; responseDetail: SlackResponseDetail; intent: SlackCoachingIntent };
}

function getDraftAction(payload: SlackInteractionPayload) {
  const action = payload.actions?.find((item) =>
    item.action_id === SLACK_DRAFT_USE_ACTION_ID ||
    item.action_id === SLACK_DRAFT_SEND_ACTION_ID ||
    item.action_id === SLACK_DRAFT_CANCEL_ACTION_ID
  );
  if (!action?.action_id || !action.value) return null;

  try {
    const parsed = JSON.parse(action.value) as SlackDraftActionValue;
    if (!parsed.sessionId || !parsed.optionId) return null;
    return {
      actionId: action.action_id,
      sessionId: parsed.sessionId,
      optionId: parsed.optionId,
    };
  } catch {
    return null;
  }
}

function getHistoryAction(payload: SlackInteractionPayload) {
  const action = payload.actions?.find((item) =>
    item.action_id === SLACK_HISTORY_CONTINUE_ACTION_ID ||
    item.action_id === SLACK_HISTORY_ARCHIVE_ACTION_ID ||
    item.action_id?.startsWith(SLACK_HISTORY_QUICK_ACTION_ID)
  );
  if (!action?.action_id) return null;
  const parsed = parseSlackHistoryAction(action.value);
  return {
    actionId: action.action_id,
    threadId: parsed?.threadId,
    flowType: parsed?.flowType,
  };
}

function detailLabel(responseDetail: SlackResponseDetail) {
  return responseDetail === "longer" ? "longer explanation" : "quick answer";
}

async function replaceSlackInteraction(responseUrl: string, text: string, blocks?: SlackBlock[]) {
  await postSlackResponse(responseUrl, text, {
    replaceOriginal: true,
    blocks,
  });
}

async function loadPendingRequest(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("slack_pending_requests")
    .select(
      "id, user_id, slack_team_id, slack_user_id, slack_channel_id, slack_channel_name, prompt, response_url, expires_at, completed_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  return data as SlackPendingRequest | null;
}

async function loadDraftSession({
  sessionId,
  teamId,
  slackUserId,
}: {
  sessionId: string;
  teamId: string;
  slackUserId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .select("id, user_id, slack_team_id, slack_user_id, slack_channel_id, thread_ts, flow_type, status, answers")
    .eq("id", sessionId)
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  return data as
    | {
        id: string;
        user_id: string;
        slack_team_id: string;
        slack_user_id: string;
        slack_channel_id: string;
        thread_ts: string | null;
        flow_type: string;
        status: string;
        answers: {
          source_channel_id?: string;
          source_channel_name?: string;
          source_thread_ts?: string;
          draft_options?: SlackDraftOption[];
        };
      }
    | null;
}

function draftDestinationLabel(answers: {
  source_channel_id?: string;
  source_channel_name?: string;
  source_thread_ts?: string;
}) {
  const channel = answers.source_channel_name ? `#${answers.source_channel_name}` : "the original Slack conversation";
  return answers.source_thread_ts ? `${channel} thread` : channel;
}

function buildDraftActionValue(sessionId: string, optionId: SlackDraftOption["id"]) {
  return JSON.stringify({ sessionId, optionId });
}

function buildDraftConfirmationPayload({
  sessionId,
  option,
  destination,
}: {
  sessionId: string;
  option: SlackDraftOption;
  destination: string;
}) {
  return buildBeckettPayload({
    title: "Beckett",
    subtitle: "Confirm before sending",
    body: [
      `Selected draft: ${option.label}`,
      "",
      option.text,
      "",
      `Destination: ${destination}`,
      "",
      "Nothing posts publicly unless you confirm.",
    ].join("\n"),
    hideTitle: true,
    actions: [
      {
        type: "button",
        text: { type: "plain_text", text: "Send to Slack" },
        style: "primary",
        action_id: SLACK_DRAFT_SEND_ACTION_ID,
        value: buildDraftActionValue(sessionId, option.id),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Cancel" },
        action_id: SLACK_DRAFT_CANCEL_ACTION_ID,
        value: buildDraftActionValue(sessionId, option.id),
      },
    ],
  });
}

async function claimPendingRequest({
  requestId,
  teamId,
  slackUserId,
}: {
  requestId: string;
  teamId: string;
  slackUserId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("slack_pending_requests")
    .update({ completed_at: now })
    .eq("id", requestId)
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .is("completed_at", null)
    .gt("expires_at", now)
    .select(
      "id, user_id, slack_team_id, slack_user_id, slack_channel_id, slack_channel_name, prompt, response_url, expires_at, completed_at"
    )
    .maybeSingle();

  if (error) throw error;
  if (data) return { pending: data as SlackPendingRequest, message: null };

  const existing = await loadPendingRequest(requestId);
  if (!existing) {
    return { pending: null, message: "That Beckett request is no longer available. Please run `/beckett` again." };
  }
  if (existing.slack_team_id !== teamId || existing.slack_user_id !== slackUserId) {
    return { pending: null, message: "That Beckett request belongs to another Slack user." };
  }
  if (existing.completed_at) {
    return { pending: null, message: "I already answered that Beckett request. Run `/beckett` again for a new one." };
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    return { pending: null, message: "That Beckett request expired. Please run `/beckett` again." };
  }
  return { pending: null, message: "I could not open that Beckett request. Please run `/beckett` again." };
}

async function sendPendingSlashResponse({
  origin,
  payload,
  requestId,
  responseDetail,
  intent,
}: {
  origin: string;
  payload: SlackInteractionPayload;
  requestId: string;
  responseDetail: SlackResponseDetail;
  intent: SlackCoachingIntent;
}) {
  const teamId = payload.team?.id || "";
  const slackUserId = payload.user?.id || "";
  const initialResponseUrl = payload.response_url || "";

  try {
    console.info("Slack slash button background started", {
      requestId,
      intent,
      responseDetail,
      hasResponseUrl: Boolean(initialResponseUrl),
      teamPresent: Boolean(teamId),
      userPresent: Boolean(slackUserId),
    });

    if (!teamId || !slackUserId) {
      await replaceSlackInteraction(initialResponseUrl, "Beckett could not read the Slack workspace and user context.");
      return;
    }

    const claim = await claimPendingRequest({ requestId, teamId, slackUserId });
    console.info("Slack slash pending request claim complete", {
      requestId,
      intent,
      responseDetail,
      claimed: Boolean(claim.pending),
      failureMessage: claim.pending ? null : claim.message,
    });
    if (!claim.pending) {
      await replaceSlackInteraction(initialResponseUrl, claim.message || "Please run `/beckett` again.");
      return;
    }

    const pending = claim.pending;
    const responseUrl = initialResponseUrl || pending.response_url || "";
    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    console.info("Slack slash button user lookup complete", {
      requestId,
      intent,
      responseDetail,
      connected: Boolean(user),
    });
    if (!user) {
      await replaceSlackInteraction(responseUrl, slackConnectText(origin));
      return;
    }

    if (!isAllowedSlackPlan(user)) {
      await replaceSlackInteraction(responseUrl, "Beckett Slack coaching is available for beta and pro users.");
      return;
    }

    const channelContext = await fetchSlackConversationContext({
      accessToken: user.accessToken,
      channelId: pending.slack_channel_id,
      channelName: pending.slack_channel_name,
    });
    const coachingContext = await buildSlackCoachingContext({
      user,
      prompt: pending.prompt,
      activeContext: channelContext,
      contextChannelId: pending.slack_channel_id,
    });
    console.info("Slack slash channel context fetched", {
      requestId,
      intent,
      responseDetail,
      contextStatus: coachingContext.status,
      contextFailureReason: coachingContext.failureReason,
      contextMessageCount: coachingContext.messageCount,
      broaderSearchUsed: coachingContext.broaderSearchUsed,
    });
    const response = await runSlackCoaching({
      user,
      action: "slash_command",
      prompt: pending.prompt,
      sourceLabel: `/beckett:${intent}:${responseDetail}`,
      messageText: coachingContext.text,
      contextStatus: coachingContext.status,
      contextFailureReason: coachingContext.failureReason,
      contextMessageCount: coachingContext.messageCount,
      broaderSearchUsed: coachingContext.broaderSearchUsed,
      responseDetail,
      intent,
    });

    const contextNote = slackContextUserNote(coachingContext);
    const responsePayload = buildAskedResponsePayload({
      prompt: pending.prompt,
      response,
      intent,
      footer: contextNote || (coachingContext.broaderSearchUsed ? "Used relevant Slack history for context." : undefined),
    });
    await replaceSlackInteraction(responseUrl, responsePayload.text, responsePayload.blocks);
    console.info("Slack slash final response posted", {
      requestId,
      intent,
      responseDetail,
    });
  } catch (error) {
    console.error("Slack slash button response failed", {
      requestId,
      intent,
      responseDetail,
      message: error instanceof Error ? error.message : String(error),
    });
    await replaceSlackInteraction(
      initialResponseUrl,
      `Beckett could not finish that request: ${handleSlackAiError(error)}`
    );
  }
}

async function handleSlashButtonResponse({
  origin,
  payload,
  requestId,
  responseDetail,
  intent,
}: {
  origin: string;
  payload: SlackInteractionPayload;
  requestId: string;
  responseDetail: SlackResponseDetail;
  intent: SlackCoachingIntent;
}) {
  const responseUrl = payload.response_url || "";
  if (responseUrl) {
    await replaceSlackInteraction(responseUrl, `Beckett is preparing your ${detailLabel(responseDetail)}...`);
    console.info("Slack slash preparing state posted", {
      requestId,
      intent,
      responseDetail,
    });
  }

  await sendPendingSlashResponse({
    origin,
    payload,
    requestId,
    responseDetail,
    intent,
  });
}

async function sendMessageShortcutResponse({
  origin,
  payload,
  messageText,
}: {
  origin: string;
  payload: SlackInteractionPayload;
  messageText: string;
}) {
  const teamId = payload.team?.id || "";
  const slackUserId = payload.user?.id || "";
  const responseUrl = payload.response_url || "";

  try {
    const preparing = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Message coaching",
      body: "Beckett is reading that message...",
      hideTitle: true,
    });
    await postSlackResponse(responseUrl, preparing.text, { blocks: preparing.blocks }).catch((error) => {
      console.error("Slack shortcut preparing response failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });

    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    if (!user) {
      const botAccessToken = await lookupSlackWorkspaceBotToken(teamId).catch((error) => {
        console.error("Slack workspace bot token lookup for guest shortcut failed", {
          teamPresent: Boolean(teamId),
          slackUserPresent: Boolean(slackUserId),
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (!botAccessToken) {
        await postSlackResponse(responseUrl, slackConnectText(origin), { replaceOriginal: true });
        return;
      }

      const guestPrompt = buildShortcutPrompt(payload);
      const response = await runSlackGuestCoaching({
        teamId,
        slackUserId,
        action: "message_shortcut",
        prompt: guestPrompt,
        messageText,
        intent: "respond",
      });
      const responsePayload = buildBeckettPayload({
        title: "Beckett",
        subtitle: "",
        prompt: guestPrompt,
        body: response,
        footer: "Connect Slack in Beckett Settings to use your coaching profile, contact context, broader Slack history, and saved Beckett conversations.",
        hideTitle: true,
      });
      await postSlackResponse(responseUrl, responsePayload.text, {
        blocks: responsePayload.blocks,
        replaceOriginal: true,
      });
      return;
    }

    const authorRelationship = await resolveSlackAuthorRelationshipContext({
      user,
      teamId,
      slackAuthorUserId: payload.message?.user,
      interactionType: "slack_message_shortcut",
    });
    const authorLabel =
      authorRelationship?.contact?.name ||
      authorRelationship?.slackProfile?.name ||
      payload.message?.username ||
      null;
    const prompt = buildShortcutPrompt(payload, authorLabel);

    if (!isAllowedSlackPlan(user)) {
      await postSlackResponse(responseUrl, "Beckett Slack coaching is available for beta and pro users.", {
        replaceOriginal: true,
      });
      return;
    }

    const channelContext = await fetchSlackConversationContext({
      accessToken: user.accessToken,
      channelId: payload.channel?.id,
      channelName: payload.channel?.name,
      messageTs: payload.message?.ts,
      threadTs: payload.message?.thread_ts,
    });
    const coachingContext = await buildSlackCoachingContext({
      user,
      prompt,
      activeContext: channelContext,
      contextChannelId: payload.channel?.id,
    });
    const relationshipNote =
      authorRelationship && !authorRelationship.linked && authorRelationship.slackIdentifier
        ? `Slack note: I saw ${authorRelationship.slackProfile?.name || "this person"} as a real Slack user. To use relationship context next time, add confirmed Slack ID ${authorRelationship.slackIdentifier} to their Beckett contact.`
        : "";
    const combinedContext = [
      "Selected Slack message:",
      messageText,
      coachingContext.text ? `\n${coachingContext.text}` : "",
    ].filter(Boolean).join("\n");
    const response = await runSlackCoaching({
      user,
      action: "message_shortcut",
      prompt,
      sourceLabel: "slack_message_shortcut",
      messageText: combinedContext,
      contextStatus: coachingContext.status,
      contextFailureReason: coachingContext.failureReason,
      contextMessageCount: coachingContext.messageCount,
      broaderSearchUsed: coachingContext.broaderSearchUsed,
      relationshipContext: authorRelationship?.promptContext || null,
      intent: "respond",
    });

    const contextNote = slackContextUserNote(coachingContext);
    const agentDelivery = await postSlackAgentMessage({
      botAccessToken: user.botAccessToken,
      slackUserId,
      title: "Message coaching",
      text: [
        contextNote || (coachingContext.broaderSearchUsed ? "Used relevant Slack history for context." : ""),
        relationshipNote,
        response,
      ].filter(Boolean).join("\n\n"),
    });

    if (agentDelivery.ok) {
      const agentChannelId = "channelId" in agentDelivery ? agentDelivery.channelId : null;
      const agentThreadTs = "ts" in agentDelivery ? agentDelivery.ts : null;
      if (agentChannelId && agentThreadTs && user.botAccessToken) {
        const coachingThread = await createSlackCoachingThread({
          user,
          teamId,
          slackUserId,
          flowType: "message",
          title: slackHistoryTitle("message", authorLabel || (payload.channel?.name ? `#${payload.channel.name}` : "this Slack conversation")),
          promptSnippet: prompt,
          summary: summarizeSlackCoachingResponse(response, prompt),
          slackChannelId: agentChannelId,
          threadTs: agentThreadTs,
          sourceChannelId: payload.channel?.id,
          sourceChannelName: payload.channel?.name,
          status: "completed",
        }).catch((error) => {
          console.error("Slack shortcut history create failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
        if (coachingThread?.id) {
          await recordSlackCoachingBotMessage({
            threadId: coachingThread.id,
            userId: user.id,
            channelId: agentChannelId,
            messageTs: agentThreadTs,
            kind: "opener",
          }).catch(() => null);
          await appendSlackCoachingMessage({
            threadId: coachingThread.id,
            user,
            teamId,
            slackUserId,
            role: "user",
            content: prompt,
          }).catch(() => null);
          await appendSlackCoachingMessage({
            threadId: coachingThread.id,
            user,
            teamId,
            slackUserId,
            role: "beckett",
            content: response,
          }).catch(() => null);
        }

        const draftSession = await createSlackDraftActionSession({
          user,
          teamId,
          slackUserId,
          agentChannelId,
          agentThreadTs,
          sourceChannelId: payload.channel?.id,
          sourceChannelName: payload.channel?.name,
          sourceThreadTs: payload.message?.thread_ts || payload.message?.ts,
          prompt,
          response,
        });

        if (draftSession.actions.length) {
          const actionPayload = buildBeckettPayload({
            title: "Beckett",
            subtitle: "Choose a draft",
            body: "Pick the version you want to review before sending.",
            hideTitle: true,
            actions: draftSession.actions,
          });
          const postedAction = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
            channel: agentChannelId,
            thread_ts: agentThreadTs,
            ...actionPayload,
          });
          if (postedAction.ok && postedAction.ts) {
            await recordSlackCoachingBotMessage({
              threadId: coachingThread?.id,
              userId: user.id,
              channelId: agentChannelId,
              messageTs: postedAction.ts,
              kind: "actions",
            }).catch(() => null);
          }
        }
      }

      const ack = buildBeckettPayload({
        title: "Beckett",
        subtitle: "Message coaching",
        body: "I moved this into your private Beckett conversation.",
      });
      await postSlackResponse(responseUrl, ack.text, { blocks: ack.blocks, replaceOriginal: true });
      return;
    }

    const responsePayload = buildBeckettPayload({
      title: "Beckett",
      subtitle: "Message coaching",
      prompt,
      body: [
        "I prepared this privately here because the Beckett coach panel was not available.",
        contextNote || "",
        relationshipNote,
        response,
      ].filter(Boolean).join("\n\n"),
    });
    await postSlackResponse(responseUrl, responsePayload.text, { blocks: responsePayload.blocks, replaceOriginal: true });
  } catch (error) {
    await postSlackResponse(responseUrl, `Beckett could not finish that request: ${handleSlackAiError(error)}`, {
      replaceOriginal: true,
    });
  }
}

async function handleDraftButtonResponse({
  origin,
  payload,
  actionId,
  sessionId,
  optionId,
}: {
  origin: string;
  payload: SlackInteractionPayload;
  actionId: string;
  sessionId: string;
  optionId: SlackDraftOption["id"];
}) {
  const responseUrl = payload.response_url || "";
  const teamId = payload.team?.id || "";
  const slackUserId = payload.user?.id || "";

  try {
    if (!teamId || !slackUserId) {
      await replaceSlackInteraction(responseUrl, "Beckett could not read the Slack workspace and user context.");
      return;
    }

    const session = await loadDraftSession({ sessionId, teamId, slackUserId });
    const option = session?.answers?.draft_options?.find((item) => item.id === optionId);
    if (!session || !option) {
      await replaceSlackInteraction(responseUrl, "That draft is no longer available. Ask Beckett to draft a new response.");
      return;
    }

    if (actionId === SLACK_DRAFT_CANCEL_ACTION_ID) {
      await replaceSlackInteraction(responseUrl, "Canceled. Nothing was posted.");
      return;
    }

    if (!session.answers.source_channel_id) {
      await replaceSlackInteraction(
        responseUrl,
        [
          "I do not have the original Slack destination for this draft, so I will not offer a send button.",
          "",
          option.text,
        ].join("\n")
      );
      return;
    }

    const destination = draftDestinationLabel(session.answers);
    if (actionId === SLACK_DRAFT_USE_ACTION_ID) {
      const confirmation = buildDraftConfirmationPayload({ sessionId, option, destination });
      await replaceSlackInteraction(responseUrl, confirmation.text, confirmation.blocks);
      return;
    }

    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    if (!user?.botAccessToken) {
      await replaceSlackInteraction(responseUrl, slackConnectText(origin, "Beckett could not send that draft because Slack needs to be reconnected."));
      return;
    }

    const sent = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
      channel: session.answers.source_channel_id,
      thread_ts: session.answers.source_thread_ts,
      text: option.text,
    });

    if (!sent.ok) {
      await replaceSlackInteraction(
        responseUrl,
        `Beckett could not post that draft to ${destination}: ${sent.error || "Slack did not accept the message."}`
      );
      return;
    }

    await replaceSlackInteraction(responseUrl, `Sent to ${destination}.`);
  } catch (error) {
    console.error("Slack draft button action failed", {
      sessionId,
      optionId,
      actionId,
      message: error instanceof Error ? error.message : String(error),
    });
    await replaceSlackInteraction(responseUrl, "Beckett could not finish that draft action. Please try again.");
  }
}

function quickPrompt(flowType: SlackHistoryFlowType, thread?: { title?: string | null; summary?: string | null; prompt_snippet?: string | null }) {
  const context = thread ? `\n\nPrevious Beckett context: ${[thread.title, thread.summary, thread.prompt_snippet].filter(Boolean).join(" — ")}` : "";
  switch (flowType) {
    case "respond":
      return `Help me respond to a Slack conversation.${context}`;
    case "decode":
      return `Help me decode a Slack conversation and separate visible facts from possible interpretation.${context}`;
    case "rewrite":
      return `Help me rewrite a Slack message so it is clearer.${context}`;
    case "prep":
      return `Help me prepare for a conversation.${context}`;
    case "practice":
      return `Help me practice a conversation.${context}`;
    default:
      return `Help me with this Slack conversation.${context}`;
  }
}

async function handleHistoryButtonResponse({
  payload,
  actionId,
  threadId,
  flowType,
}: {
  payload: SlackInteractionPayload;
  actionId: string;
  threadId?: string;
  flowType?: SlackHistoryFlowType;
}) {
  const teamId = payload.team?.id || "";
  const slackUserId = payload.user?.id || "";

  try {
    if (!teamId || !slackUserId) return;
    const user = await lookupSlackConnectedUser(teamId, slackUserId);
    if (!user?.botAccessToken || !isAllowedSlackPlan(user)) return;
    const thread = threadId ? await loadSlackCoachingThread({ threadId, userId: user.id }) : null;

    if (actionId === SLACK_HISTORY_ARCHIVE_ACTION_ID && threadId) {
      await archiveSlackCoachingThread({ threadId, userId: user.id });
      await cleanupSlackCoachingBotMessages({
        botAccessToken: user.botAccessToken,
        threadId,
        userId: user.id,
      }).catch((error) => {
        console.error("Slack archive bot message cleanup failed", {
          threadId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      if (thread?.slack_channel_id) {
        await setSlackAgentSuggestedPrompts({
          botAccessToken: user.botAccessToken,
          channelId: thread.slack_channel_id,
        }).catch(() => null);
      }
      await publishSlackHome({
        botAccessToken: user.botAccessToken,
        slackUserId,
        userId: user.id,
        notice: "Archived. That conversation is still available here in Beckett History.",
      });
      return;
    }

    if (actionId === SLACK_HISTORY_CONTINUE_ACTION_ID && thread) {
      const messages = await loadSlackCoachingMessages({
        threadId: thread.id,
        userId: user.id,
        limit: 10,
      }).catch(() => []);
      const payloadToPost = buildSlackHistoryContinuePayload(thread, messages);
      if (thread.slack_channel_id && thread.thread_ts) {
        const postedContinue = await slackApiPost<{ ts?: string }>(user.botAccessToken, "chat.postMessage", {
          channel: thread.slack_channel_id,
          thread_ts: thread.thread_ts,
          ...payloadToPost,
        });
        if (postedContinue.ok && postedContinue.ts) {
          await recordSlackCoachingBotMessage({
            threadId: thread.id,
            userId: user.id,
            channelId: thread.slack_channel_id,
            messageTs: postedContinue.ts,
            kind: "continue",
          }).catch(() => null);
        }
      } else {
        await postSlackAgentMessage({
          botAccessToken: user.botAccessToken,
          slackUserId,
          title: `Continue: ${thread.title}`,
          text: payloadToPost.text,
        });
      }
      await publishSlackHome({
        botAccessToken: user.botAccessToken,
        slackUserId,
        userId: user.id,
        notice: "I reopened that Beckett conversation in Messages. Slack keeps the Home tab here, so switch to Messages to keep going.",
      }).catch(() => null);
      return;
    }

    if (actionId.startsWith(SLACK_HISTORY_QUICK_ACTION_ID) && flowType && flowType !== "message") {
      const started = await startGuidedSlackFlow({
        user,
        teamId,
        slackUserId,
        intent: flowType,
        prompt: quickPrompt(flowType, thread || undefined),
      });
      await publishSlackHome({
        botAccessToken: user.botAccessToken,
        slackUserId,
        userId: user.id,
        notice: started.ok
          ? "I started that Beckett conversation in Messages. Slack keeps the Home tab here, so switch to Messages to keep going."
          : "I had trouble starting that private Beckett conversation. Try opening Messages and sending Beckett a note directly.",
      }).catch(() => null);
    }
  } catch (error) {
    console.error("Slack history button action failed", {
      actionId,
      threadId,
      flowType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verification = verifySlackRequest(req, rawBody);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: verification.status });
  }

  const payload = parseInteractionPayload(rawBody);
  if (!payload) return NextResponse.json({ error: "Invalid Slack payload." }, { status: 400 });

  if (payload.type === "block_actions") {
    const historyAction = getHistoryAction(payload);
    if (historyAction) {
      scheduleSlackBackgroundTask(
        "Slack history button response failed",
        handleHistoryButtonResponse({
          payload,
          actionId: historyAction.actionId,
          threadId: historyAction.threadId,
          flowType: historyAction.flowType,
        })
      );
      return NextResponse.json({ ok: true });
    }

    const draftAction = getDraftAction(payload);
    if (draftAction) {
      scheduleSlackBackgroundTask(
        "Slack draft button response failed",
        handleDraftButtonResponse({
          origin: req.nextUrl.origin,
          payload,
          actionId: draftAction.actionId,
          sessionId: draftAction.sessionId,
          optionId: draftAction.optionId,
        })
      );

      return NextResponse.json({ ok: true });
    }

    const detailAction = getSlashDetailAction(payload);
    if (!detailAction) return NextResponse.json({ ok: true });

    console.info("Slack slash button clicked", {
      requestId: detailAction.requestId,
      intent: detailAction.intent,
      responseDetail: detailAction.responseDetail,
      hasResponseUrl: Boolean(payload.response_url),
      teamPresent: Boolean(payload.team?.id),
      userPresent: Boolean(payload.user?.id),
    });

    scheduleSlackBackgroundTask(
      "Slack slash choice response failed",
      handleSlashButtonResponse({
        origin: req.nextUrl.origin,
        payload,
        requestId: detailAction.requestId,
        responseDetail: detailAction.responseDetail,
        intent: detailAction.intent,
      })
    );

    return NextResponse.json({ ok: true });
  }

  if (payload.type !== "message_action" || payload.callback_id !== "beckett_message_context") {
    return NextResponse.json({ ok: true });
  }

  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const responseUrl = payload.response_url || "";
  const messageText = extractMessageText(payload);

  if (!teamId || !slackUserId) {
    if (responseUrl) {
      scheduleSlackBackgroundTask(
        "Slack shortcut missing user response failed",
        postSlackResponse(responseUrl, "Beckett could not read the Slack workspace and user context.")
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!messageText) {
    if (responseUrl) {
      scheduleSlackBackgroundTask(
        "Slack shortcut missing text response failed",
        postSlackResponse(responseUrl, "Beckett could not read message text from that Slack shortcut.")
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!responseUrl) {
    return NextResponse.json({ ok: true });
  }

  scheduleSlackBackgroundTask(
    "Slack message shortcut response failed",
    sendMessageShortcutResponse({
      origin: req.nextUrl.origin,
      payload,
      messageText,
    })
  );
  return NextResponse.json({ ok: true });
}
