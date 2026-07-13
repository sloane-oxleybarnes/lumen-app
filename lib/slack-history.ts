import { supabaseAdmin } from "@/lib/server-admin";
import { buildBeckettPayload, slackApiPost, SlackBlock, SlackConnectedUser } from "@/lib/slack-app";

export const SLACK_HISTORY_CONTINUE_ACTION_ID = "beckett_history_continue";
export const SLACK_HISTORY_ARCHIVE_ACTION_ID = "beckett_history_archive";
export const SLACK_HISTORY_QUICK_ACTION_ID = "beckett_history_quick";
export const SLACK_HISTORY_EXPLAIN_MORE_ACTION_ID = "beckett_history_explain_more";
export const SLACK_HISTORY_SETTINGS_ACTION_ID = "beckett_history_settings";
export const SLACK_INACTIVITY_START_CARD_DELAY_MS =
  Number(process.env.SLACK_INACTIVITY_START_CARD_DELAY_MS || 5 * 60 * 1000);

export type SlackHistoryFlowType = "respond" | "rewrite" | "decode" | "relationship" | "prep" | "practice" | "message";

export type SlackGuestPrepState = {
  threadTs: string;
  step: "person" | "location" | "outcome" | "concern" | "complete";
  person?: string;
  location?: "written" | "call" | "in_person";
  outcome?: string;
  concern?: string;
};

export type SlackGuestPracticeState = {
  threadTs: string;
  prepThreadTs: string;
  person: string;
  location: "written" | "call" | "in_person";
  outcome: string;
  concern: string;
};

export const SLACK_GUEST_PREP_PRACTICE_ACTION_ID = "beckett_guest_prep_practice";

export async function loadSlackGuestPrepState({
  teamId,
  slackUserId,
  threadTs,
}: {
  teamId: string;
  slackUserId: string;
  threadTs: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_guest_usage_events")
    .select("metadata")
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .eq("action", "guided_prep_state")
    .contains("metadata", { threadTs })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.metadata || null) as SlackGuestPrepState | null;
}

export async function saveSlackGuestPrepState({
  teamId,
  slackUserId,
  state,
}: {
  teamId: string;
  slackUserId: string;
  state: SlackGuestPrepState;
}) {
  const { error } = await supabaseAdmin.from("slack_guest_usage_events").insert({
    slack_team_id: teamId,
    slack_user_id: slackUserId,
    source: "slack_guest",
    action: "guided_prep_state",
    token_estimate: 0,
    metadata: state,
  });
  if (error) throw error;
}

export async function loadSlackGuestPracticeState({
  teamId,
  slackUserId,
  threadTs,
}: {
  teamId: string;
  slackUserId: string;
  threadTs: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_guest_usage_events")
    .select("metadata")
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .eq("action", "guided_practice_state")
    .contains("metadata", { threadTs })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.metadata || null) as SlackGuestPracticeState | null;
}

export async function saveSlackGuestPracticeState({
  teamId,
  slackUserId,
  state,
}: {
  teamId: string;
  slackUserId: string;
  state: SlackGuestPracticeState;
}) {
  const { error } = await supabaseAdmin.from("slack_guest_usage_events").insert({
    slack_team_id: teamId,
    slack_user_id: slackUserId,
    source: "slack_guest",
    action: "guided_practice_state",
    token_estimate: 0,
    metadata: state,
  });
  if (error) throw error;
}

export type SlackCoachingThread = {
  id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  slack_channel_id: string | null;
  thread_ts: string | null;
  source_channel_id: string | null;
  source_channel_name: string | null;
  flow_type: SlackHistoryFlowType;
  title: string;
  summary: string | null;
  prompt_snippet: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type SlackCoachingMessage = {
  id: string;
  coaching_thread_id: string;
  user_id: string;
  slack_team_id: string;
  slack_user_id: string;
  role: "user" | "beckett";
  content: string;
  created_at: string;
};

type SlackCoachingBotMessage = {
  id: string;
  coaching_thread_id: string;
  user_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  kind: string | null;
  created_at?: string | null;
  deleted_at: string | null;
};

type UpsertThreadInput = {
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  flowType: SlackHistoryFlowType;
  title: string;
  promptSnippet?: string | null;
  summary?: string | null;
  slackChannelId?: string | null;
  threadTs?: string | null;
  sourceChannelId?: string | null;
  sourceChannelName?: string | null;
  status?: "active" | "completed";
};

function truncate(value: string | null | undefined, length: number) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 3).trim()}...`;
}

function truncateMessageContent(value: string | null | undefined, length: number) {
  const text = (value || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 3).trim()}...`;
}

function flowLabel(flowType: SlackHistoryFlowType) {
  switch (flowType) {
    case "respond":
      return "Respond";
    case "rewrite":
      return "Rewrite";
    case "decode":
      return "Decode";
    case "relationship":
      return "Relationship read";
    case "prep":
      return "Prep";
    case "practice":
      return "Practice";
    case "message":
      return "Message coaching";
  }
}

export function slackHistoryTitle(flowType: SlackHistoryFlowType, sourceLabel?: string | null) {
  return truncate(`${flowLabel(flowType)}: ${sourceLabel || "this Slack conversation"}`, 120);
}

function oneSentenceSummary(value: string | null | undefined, fallback: string) {
  const cleaned = (value || fallback || "")
    .replace(/\bReply in this Beckett thread to keep this saved as one conversation\..*$/i, "")
    .replace(/\bStart a new Beckett message to begin a separate case\./i, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || cleaned;
  return truncate(firstSentence, 140) || "Open this coaching thread to keep working with Beckett.";
}

export function summarizeSlackCoachingResponse(response: string, fallback: string) {
  const cleaned = response
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(Possible read|Next move|Draft options|What is visible|What not to over-read|Rewritten message|Why this works)$/i.test(line))
    .filter((line) => !/^Reply in this Beckett thread to keep this saved as one conversation/i.test(line))
    .filter((line) => !/^Start a new Beckett message to begin a separate case/i.test(line));

  return oneSentenceSummary(cleaned.join(" "), fallback);
}

export async function createSlackCoachingThread(input: UpsertThreadInput) {
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .insert({
      user_id: input.user.id,
      slack_team_id: input.teamId,
      slack_user_id: input.slackUserId,
      slack_channel_id: input.slackChannelId || null,
      thread_ts: input.threadTs || null,
      source_channel_id: input.sourceChannelId || null,
      source_channel_name: input.sourceChannelName || null,
      flow_type: input.flowType,
      title: input.title,
      summary: input.summary || null,
      prompt_snippet: truncate(input.promptSnippet, 240) || null,
      status: input.status || "active",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SlackCoachingThread;
}

export async function updateSlackCoachingThread(
  threadId: string | null | undefined,
  patch: Partial<Pick<SlackCoachingThread, "slack_channel_id" | "thread_ts" | "summary" | "status" | "title">>
) {
  if (!threadId) return null;
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as SlackCoachingThread | null;
}

export async function appendSlackCoachingMessage({
  threadId,
  user,
  teamId,
  slackUserId,
  role,
  content,
}: {
  threadId?: string | null;
  user: SlackConnectedUser;
  teamId: string;
  slackUserId: string;
  role: SlackCoachingMessage["role"];
  content?: string | null;
}) {
  const cleanContent = truncateMessageContent(content, 4000);
  if (!threadId || !cleanContent) return null;

  const { data, error } = await supabaseAdmin
    .from("slack_coaching_messages")
    .insert({
      coaching_thread_id: threadId,
      user_id: user.id,
      slack_team_id: teamId,
      slack_user_id: slackUserId,
      role,
      content: cleanContent,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SlackCoachingMessage;
}

export async function recordSlackCoachingBotMessage({
  threadId,
  userId,
  channelId,
  messageTs,
  kind,
}: {
  threadId?: string | null;
  userId?: string | null;
  channelId?: string | null;
  messageTs?: string | null;
  kind?: string | null;
}) {
  if (!threadId || !userId || !channelId || !messageTs) return null;
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_bot_messages")
    .upsert(
      {
        coaching_thread_id: threadId,
        user_id: userId,
        slack_channel_id: channelId,
        slack_message_ts: messageTs,
        kind: kind || null,
      },
      { onConflict: "coaching_thread_id,slack_channel_id,slack_message_ts" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as SlackCoachingBotMessage;
}

export async function cleanupSlackCoachingBotMessages({
  botAccessToken,
  threadId,
  userId,
}: {
  botAccessToken?: string | null;
  threadId: string;
  userId: string;
}) {
  if (!botAccessToken) return;
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_bot_messages")
    .select("*")
    .eq("coaching_thread_id", threadId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const messages = (data || []) as SlackCoachingBotMessage[];
  for (const message of messages) {
    // Slack only permits third-party apps to delete messages posted by the same bot.
    // User-authored messages and some older/untracked app messages may remain visible.
    const result = await slackApiPost(botAccessToken, "chat.delete", {
      channel: message.slack_channel_id,
      ts: message.slack_message_ts,
    }).catch(() => null);
    if (result?.ok) {
      await supabaseAdmin
        .from("slack_coaching_bot_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", message.id)
        .eq("user_id", userId);
    } else if (result && !result.ok) {
      console.info("Slack bot message cleanup skipped", {
        threadId,
        channelId: message.slack_channel_id,
        messageTs: message.slack_message_ts,
        error: result.error || "unknown_error",
      });
    }
  }
}

export async function loadSlackCoachingMessages({
  threadId,
  userId,
  limit = 12,
}: {
  threadId: string;
  userId: string;
  limit?: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_messages")
    .select("*")
    .eq("coaching_thread_id", threadId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data || []) as SlackCoachingMessage[]).reverse();
}

export function formatSlackCoachingMessages(messages: SlackCoachingMessage[], maxLength = 1800) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Beckett"}: ${message.content}`)
    .join("\n\n");
  const cleaned = transcript.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
}

export async function findSlackCoachingThreadBySlackThread({
  userId,
  teamId,
  slackUserId,
  channelId,
  threadTs,
}: {
  userId: string;
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
}) {
  if (!threadTs) return null;
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("slack_team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .eq("slack_channel_id", channelId)
    .eq("thread_ts", threadTs)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as SlackCoachingThread | null;
}

export async function completeActiveSlackSessionsForThread({
  threadId,
  userId,
}: {
  threadId: string;
  userId: string;
}) {
  const { error } = await supabaseAdmin
    .from("slack_agent_sessions")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("coaching_thread_id", threadId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw error;
}

export async function listRecentSlackCoachingThreads(userId: string, limit = 8) {
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as SlackCoachingThread[];
}

export async function archiveSlackCoachingThread({
  threadId,
  userId,
}: {
  threadId: string;
  userId: string;
}) {
  const { error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("user_id", userId);

  if (error) throw error;
  await completeActiveSlackSessionsForThread({ threadId, userId });
}

export async function loadSlackCoachingThread({
  threadId,
  userId,
}: {
  threadId: string;
  userId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_coaching_threads")
    .select("*")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as SlackCoachingThread | null;
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function historyCard(thread: SlackCoachingThread): SlackBlock[] {
  const summary = oneSentenceSummary(thread.summary, thread.prompt_snippet || "Open this coaching thread to keep working with Beckett.");
  const status = thread.archived_at ? "archived" : thread.status;
  const elements: Record<string, unknown>[] = [
    {
      type: "button",
      text: { type: "plain_text", text: "Continue" },
      style: "primary",
      action_id: SLACK_HISTORY_CONTINUE_ACTION_ID,
      value: JSON.stringify({ threadId: thread.id }),
    },
  ];

  if (!thread.archived_at) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Archive" },
      action_id: SLACK_HISTORY_ARCHIVE_ACTION_ID,
      value: JSON.stringify({ threadId: thread.id }),
    });
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${thread.title}*\n${summary}\n_${flowLabel(thread.flow_type)} · ${status} · ${relativeTime(thread.updated_at)}_`,
      },
    },
    {
      type: "actions",
      elements,
    },
    { type: "divider" },
  ];
}

export function buildSlackHomeBlocks(threads: SlackCoachingThread[], notice?: string | null): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Beckett History" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Recent Beckett coaching conversations. Continue anything you want to revisit, or archive active threads when you are done.",
      },
    },
    ...(notice
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: notice,
            },
          },
        ]
      : []),
    { type: "divider" },
  ];

  if (!threads.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No conversations yet. Open Messages to start with Decode, Respond, Rewrite, or Prep / Practice.",
      },
    });
    return blocks;
  }

  for (const thread of threads) blocks.push(...historyCard(thread));
  return blocks.slice(0, 90);
}

export function buildSlackConnectHomeBlocks(settingsUrl: string): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Beckett History" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Connect Slack from Beckett Settings to see your coaching history here.",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Messages is where you work with Beckett. Home stores your recent and archived coaching conversations.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open Beckett Settings" },
          action_id: SLACK_HISTORY_SETTINGS_ACTION_ID,
          url: settingsUrl,
        },
      ],
    },
  ];
}

export async function publishSlackHome({
  botAccessToken,
  slackUserId,
  userId,
  notice,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  userId: string;
  notice?: string | null;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };
  let threads: SlackCoachingThread[] = [];
  try {
    threads = await listRecentSlackCoachingThreads(userId);
  } catch (error) {
    console.error("Slack Home history lookup failed", {
      userPresent: Boolean(userId),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return slackApiPost(botAccessToken, "views.publish", {
    user_id: slackUserId,
    view: {
      type: "home",
      blocks: buildSlackHomeBlocks(threads, notice),
    },
  });
}

export function buildSlackThreadArchiveAction(threadId: string | null | undefined) {
  if (!threadId) return [];
  return [
    {
      type: "button",
      text: { type: "plain_text", text: "Archive conversation" },
      action_id: SLACK_HISTORY_ARCHIVE_ACTION_ID,
      value: JSON.stringify({ threadId }),
    },
  ];
}

export function buildSlackExplainMoreAction(threadId: string | null | undefined) {
  if (!threadId) return [];
  return [
    {
      type: "button",
      text: { type: "plain_text", text: "Explain more" },
      action_id: SLACK_HISTORY_EXPLAIN_MORE_ACTION_ID,
      value: JSON.stringify({ threadId }),
    },
  ];
}

export function buildSlackStartCardPayload(variant: "archived" | "inactivity" = "archived") {
  const body = variant === "inactivity"
    ? [
        "Want to start something new? All conversations are saved on the Home tab.",
        "",
        "What can I help with next?",
      ].join("\n")
    : [
        "The last conversation was archived. If you’d like to revisit that conversation, you can find it under the Home tab.",
        "",
        "What can I help with next?",
      ].join("\n");

  return buildBeckettPayload({
    title: "Beckett",
    subtitle: "",
    body,
    hideTitle: true,
    actions: [
      {
        type: "button",
        text: { type: "plain_text", text: "Decode a Selected Message" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_decode`,
        value: JSON.stringify({ flowType: "decode" }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Respond to a Selected Message" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_respond`,
        value: JSON.stringify({ flowType: "respond" }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Edit a Draft" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_rewrite`,
        value: JSON.stringify({ flowType: "rewrite" }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Prep / Practice" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_prep`,
        value: JSON.stringify({ flowType: "prep" }),
      },
    ],
  });
}

export async function scheduleSlackInactivityStartCard({
  botAccessToken,
  channelId,
}: {
  botAccessToken?: string | null;
  threadId?: string | null;
  userId?: string | null;
  channelId?: string | null;
}) {
  if (!botAccessToken || !channelId) return;

  const payload = buildSlackStartCardPayload("inactivity");
  const marker = "Want to start something new?";
  const pending = await slackApiPost<{
    scheduled_messages?: Array<{ id?: string; text?: string }>;
  }>(botAccessToken, "chat.scheduledMessages.list", {
    channel: channelId,
    limit: 100,
  }).catch(() => null);

  for (const scheduled of pending?.scheduled_messages || []) {
    if (!scheduled.id || !String(scheduled.text || "").includes(marker)) continue;
    await slackApiPost(botAccessToken, "chat.deleteScheduledMessage", {
      channel: channelId,
      scheduled_message_id: scheduled.id,
    }).catch(() => null);
  }

  const postAt = Math.ceil((Date.now() + SLACK_INACTIVITY_START_CARD_DELAY_MS) / 1000);
  const scheduled = await slackApiPost(botAccessToken, "chat.scheduleMessage", {
    channel: channelId,
    post_at: postAt,
    ...payload,
  });
  if (!scheduled.ok) throw new Error(scheduled.error || "slack_schedule_message_failed");
}

export async function publishSlackConnectHome({
  botAccessToken,
  slackUserId,
  settingsUrl,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  settingsUrl: string;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };
  return slackApiPost(botAccessToken, "views.publish", {
    user_id: slackUserId,
    view: {
      type: "home",
      blocks: buildSlackConnectHomeBlocks(settingsUrl),
    },
  });
}

export async function publishSlackHomeResult(input: {
  botAccessToken: string | null;
  slackUserId: string;
  userId: string;
}) {
  const result = await publishSlackHome(input);
  if (!result.ok) {
    console.error("Slack views.publish failed", {
      slackUserPresent: Boolean(input.slackUserId),
      error: result.error || "unknown_error",
      response: result,
    });
  }
  return result;
}

export function buildSlackHistoryContinuePayload(thread: SlackCoachingThread, messages: SlackCoachingMessage[] = []) {
  const transcript = formatSlackCoachingMessages(messages, 1800);
  const payload = buildBeckettPayload({
    title: "Beckett",
    subtitle: "",
    body: [
      `Picking this back up: ${thread.title}`,
      "",
      thread.summary || thread.prompt_snippet || "We were working through this conversation together.",
      transcript ? `\nRecent conversation:\n${transcript}` : "",
      "",
      "What do you want to do next?",
    ].join("\n"),
    hideTitle: true,
    actions: [
      {
        type: "button",
        text: { type: "plain_text", text: "Practice" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_practice`,
        value: JSON.stringify({ flowType: "practice", threadId: thread.id }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Rewrite" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_rewrite`,
        value: JSON.stringify({ flowType: "rewrite", threadId: thread.id }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Draft follow-up" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_respond`,
        value: JSON.stringify({ flowType: "respond", threadId: thread.id }),
      },
    ],
  });
  return payload;
}

export function parseSlackHistoryAction(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as { threadId?: string; flowType?: SlackHistoryFlowType };
  } catch {
    return null;
  }
}
