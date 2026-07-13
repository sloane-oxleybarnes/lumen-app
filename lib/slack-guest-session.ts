import { supabaseAdmin } from "@/lib/server-admin";

export type SlackGuestFlowType = "decode" | "respond" | "rewrite" | "prep" | "practice" | "retrieval";

export type SlackGuestSource = {
  channelId?: string;
  channelName?: string;
  messageTs?: string;
  threadTs?: string;
  author?: string;
  message?: string;
  context?: string;
  reactions?: string[];
};

export type SlackGuestSession = {
  id: string;
  slack_team_id: string;
  slack_user_id: string;
  assistant_channel_id: string;
  assistant_thread_ts: string;
  flow_type: SlackGuestFlowType;
  source: SlackGuestSource;
  state: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  transcript: Array<{ role: "user" | "beckett"; content: string }>;
  status: "active" | "completed" | "archived";
  practice_thread_ts?: string | null;
};

export async function loadSlackGuestSession(input: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("slack_guest_sessions")
    .select("*")
    .eq("slack_team_id", input.teamId)
    .eq("slack_user_id", input.slackUserId)
    .eq("assistant_channel_id", input.channelId)
    .eq("assistant_thread_ts", input.threadTs)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SlackGuestSession | null;
}

export async function startSlackGuestSession(input: {
  teamId: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  flowType: SlackGuestFlowType;
  source?: SlackGuestSource;
  state?: Record<string, unknown>;
  artifacts?: Record<string, unknown>;
  transcript?: SlackGuestSession["transcript"];
}) {
  const row = {
    slack_team_id: input.teamId,
    slack_user_id: input.slackUserId,
    assistant_channel_id: input.channelId,
    assistant_thread_ts: input.threadTs,
    flow_type: input.flowType,
    source: input.source || {},
    state: input.state || {},
    artifacts: input.artifacts || {},
    transcript: input.transcript || [],
    status: "active",
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("slack_guest_sessions")
    .upsert(row, { onConflict: "slack_team_id,slack_user_id,assistant_channel_id,assistant_thread_ts" })
    .select("*")
    .single();
  if (error) throw error;
  return data as SlackGuestSession;
}

export async function updateSlackGuestSession(
  session: SlackGuestSession,
  patch: Partial<Pick<SlackGuestSession, "flow_type" | "source" | "state" | "artifacts" | "transcript" | "status" | "practice_thread_ts">>
) {
  const { data, error } = await supabaseAdmin
    .from("slack_guest_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as SlackGuestSession;
}

export async function claimSlackGuestPractice(session: SlackGuestSession) {
  const { data, error } = await supabaseAdmin
    .from("slack_guest_sessions")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "active")
    .is("practice_thread_ts", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SlackGuestSession | null;
}

export async function releaseSlackGuestPracticeClaim(session: SlackGuestSession) {
  const { error } = await supabaseAdmin
    .from("slack_guest_sessions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .is("practice_thread_ts", null);
  if (error) throw error;
}

export function appendGuestTurn(
  transcript: SlackGuestSession["transcript"] | null | undefined,
  role: "user" | "beckett",
  content: string
) {
  return [...(transcript || []), { role, content }].slice(-24);
}

export function formatGuestTranscript(transcript: SlackGuestSession["transcript"] | null | undefined) {
  return (transcript || [])
    .map((turn) => `${turn.role === "beckett" ? "Beckett" : "User"}: ${turn.content}`)
    .join("\n")
    .slice(-6000);
}
