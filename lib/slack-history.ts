import { supabaseAdmin } from "@/lib/server-admin";
import { buildBeckettPayload, slackApiPost, SlackBlock, SlackConnectedUser } from "@/lib/slack-app";

export const SLACK_HISTORY_CONTINUE_ACTION_ID = "beckett_history_continue";
export const SLACK_HISTORY_ARCHIVE_ACTION_ID = "beckett_history_archive";
export const SLACK_HISTORY_QUICK_ACTION_ID = "beckett_history_quick";

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
    .is("archived_at", null)
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

function homeQuickAction(action: SlackHistoryFlowType, text: string) {
  return {
    type: "button",
    text: { type: "plain_text", text },
    action_id: SLACK_HISTORY_QUICK_ACTION_ID,
    value: JSON.stringify({ flowType: action }),
  };
}

function historyCard(thread: SlackCoachingThread): SlackBlock[] {
  const summary = thread.summary || thread.prompt_snippet || "Open this coaching thread to keep working with Beckett.";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${thread.title}*\n${summary}\n_${flowLabel(thread.flow_type)} · ${thread.status} · ${relativeTime(thread.updated_at)}_`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Continue" },
          style: "primary",
          action_id: SLACK_HISTORY_CONTINUE_ACTION_ID,
          value: JSON.stringify({ threadId: thread.id }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Archive" },
          action_id: SLACK_HISTORY_ARCHIVE_ACTION_ID,
          value: JSON.stringify({ threadId: thread.id }),
        },
      ],
    },
    { type: "divider" },
  ];
}

export function buildSlackHomeBlocks(threads: SlackCoachingThread[]): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Beckett" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Your communication coach for the conversations that matter.",
      },
    },
    {
      type: "actions",
      elements: [
        homeQuickAction("respond", "Respond"),
        homeQuickAction("decode", "Decode"),
        homeQuickAction("rewrite", "Rewrite"),
        homeQuickAction("prep", "Prep"),
        homeQuickAction("practice", "Practice"),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Recent Beckett conversations*" },
    },
  ];

  if (!threads.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No Beckett conversations yet. Start with a quick action above or run `/beckett respond` from a Slack conversation.",
      },
    });
    return blocks;
  }

  for (const thread of threads) blocks.push(...historyCard(thread));
  return blocks.slice(0, 90);
}

export async function publishSlackHome({
  botAccessToken,
  slackUserId,
  userId,
}: {
  botAccessToken: string | null;
  slackUserId: string;
  userId: string;
}) {
  if (!botAccessToken) return { ok: false, error: "missing_bot_token" };
  const threads = await listRecentSlackCoachingThreads(userId);
  return slackApiPost(botAccessToken, "views.publish", {
    user_id: slackUserId,
    view: {
      type: "home",
      blocks: buildSlackHomeBlocks(threads),
    },
  });
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
        action_id: SLACK_HISTORY_QUICK_ACTION_ID,
        value: JSON.stringify({ flowType: "practice", threadId: thread.id }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Rewrite" },
        action_id: SLACK_HISTORY_QUICK_ACTION_ID,
        value: JSON.stringify({ flowType: "rewrite", threadId: thread.id }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Draft follow-up" },
        action_id: SLACK_HISTORY_QUICK_ACTION_ID,
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
