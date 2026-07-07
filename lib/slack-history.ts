import { supabaseAdmin } from "@/lib/server-admin";
import { buildBeckettPayload, slackApiPost, SlackBlock, SlackConnectedUser } from "@/lib/slack-app";

export const SLACK_HISTORY_CONTINUE_ACTION_ID = "beckett_history_continue";
export const SLACK_HISTORY_ARCHIVE_ACTION_ID = "beckett_history_archive";
export const SLACK_HISTORY_QUICK_ACTION_ID = "beckett_history_quick";
export const SLACK_HISTORY_SETTINGS_ACTION_ID = "beckett_history_settings";

export type SlackHistoryFlowType = "respond" | "rewrite" | "decode" | "prep" | "practice" | "message";

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

function flowLabel(flowType: SlackHistoryFlowType) {
  switch (flowType) {
    case "respond":
      return "Respond";
    case "rewrite":
      return "Rewrite";
    case "decode":
      return "Decode";
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

export function summarizeSlackCoachingResponse(response: string, fallback: string) {
  const cleaned = response
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(Possible read|Next move|Draft options|What is visible|What not to over-read|Rewritten message|Why this works)$/i.test(line));

  return truncate(cleaned.slice(0, 2).join(" "), 220) || truncate(fallback, 220);
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
  const summary = thread.summary || thread.prompt_snippet || "Open this coaching thread to keep working with Beckett.";
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
        text: "No Beckett conversations yet. Open Messages to start with Decode, Respond, Rewrite, or Prep / Practice.",
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

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string | null | undefined) {
  return (name || "there").trim().split(/\s+/)[0] || "there";
}

function landingCard({
  title,
  description,
  flowType,
  emoji,
}: {
  title: string;
  description: string;
  flowType: Exclude<SlackHistoryFlowType, "message" | "practice">;
  emoji: string;
}): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${title}*\n${description}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Start" },
        action_id: `${SLACK_HISTORY_QUICK_ACTION_ID}_${flowType}`,
        value: JSON.stringify({ flowType }),
      },
    },
    { type: "divider" },
  ];
}

export function buildSlackMessagesLandingPayload(userName?: string | null) {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${greetingFor()}, ${firstName(userName)}.` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*What can Beckett help with today?*",
      },
    },
    { type: "divider" },
    ...landingCard({
      title: "Decode a Message",
      description: "Understand the tone, intent, and meaning of specific messages.",
      flowType: "decode",
      emoji: ":mag:",
    }),
    ...landingCard({
      title: "Respond to a Message",
      description: "Pick a specific message and Beckett can help you draft a clear response.",
      flowType: "respond",
      emoji: ":speech_balloon:",
    }),
    ...landingCard({
      title: "Rewrite a Message",
      description: "Draft your response and Beckett can help you refine it.",
      flowType: "rewrite",
      emoji: ":pencil2:",
    }),
    ...landingCard({
      title: "Prep / Practice",
      description: "Prepare for difficult conversations and understand what to expect.",
      flowType: "prep",
      emoji: ":dart:",
    }),
  ];

  return {
    text: `${greetingFor()}, ${firstName(userName)}. What can Beckett help with today?`,
    blocks: blocks.slice(0, 45),
  };
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

export async function postSlackMessagesLanding({
  botAccessToken,
  slackUserId,
  userName,
  channelId,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  userName?: string | null;
  channelId?: string | null;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };
  let targetChannelId = channelId || "";
  if (!targetChannelId) {
    const opened = await slackApiPost<{ channel?: { id?: string } }>(botAccessToken, "conversations.open", {
      users: slackUserId,
    });
    targetChannelId = opened.channel?.id || "";
    if (!opened.ok || !targetChannelId) return { ok: false, error: opened.error || "dm_open_failed" };
  }

  return slackApiPost(botAccessToken, "chat.postMessage", {
    channel: targetChannelId,
    ...buildSlackMessagesLandingPayload(userName),
  });
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

export function buildSlackHistoryContinuePayload(thread: SlackCoachingThread) {
  const payload = buildBeckettPayload({
    title: "Beckett",
    subtitle: "",
    body: [
      `Picking this back up: ${thread.title}`,
      "",
      thread.summary || thread.prompt_snippet || "We were working through this conversation together.",
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
