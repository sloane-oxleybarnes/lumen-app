import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BETA_MISSION_DEFINITIONS,
  getBetaMissionOrder,
  type BetaMissionKey,
  type BetaMissionsResponse,
  type BetaMissionView,
} from "./beta-missions";

type MissionRow = {
  id: string;
  user_id: string;
  mission_key: string;
  position: number;
  status: "active" | "completed" | "skipped";
  completion_source: "automatic" | "self_reported" | null;
  completed_at: string | null;
  skipped_at: string | null;
  feedback_rating: "helpful" | "not_helpful" | null;
  feedback_comment: string | null;
  presented_at: string | null;
};

function hasRows(result: { data: unknown[] | null; error: unknown }) {
  return !result.error && Boolean(result.data?.length);
}

async function getAutomaticallyCompletedMissions(supabase: SupabaseClient, userId: string) {
  const [profileResult, integrationsResult, usageResult, courseResult, toolkitResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed_at, extension_connected_at, strengths, workplace_triggers, communication_preferences")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_integrations").select("provider").eq("user_id", userId),
    supabase.from("ai_usage_events").select("source, action").eq("user_id", userId),
    supabase.from("course_completions").select("course_id").eq("user_id", userId).limit(1),
    supabase
      .from("course_toolkit_items")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1),
  ]);

  const profile = profileResult.data;
  const providers = new Set((integrationsResult.data || []).map((row) => row.provider));
  const usage = usageResult.data || [];
  const profileHasDetails = Boolean(
    profile?.onboarding_completed_at ||
      profile?.strengths?.length ||
      profile?.workplace_triggers?.length ||
      profile?.communication_preferences?.length
  );

  const completed = new Set<BetaMissionKey>();
  if (profileHasDetails) completed.add("complete_profile");
  if (profile?.extension_connected_at) completed.add("connect_extension");
  if (providers.has("google")) completed.add("connect_gmail");
  if (providers.has("slack")) completed.add("connect_slack");
  if (usage.some((row) => row.source === "extension")) completed.add("analyze_with_extension");
  if (usage.some((row) => row.source === "slack_desktop")) completed.add("try_slack_coaching");
  if (usage.some((row) => row.source === "dashboard" && String(row.action).startsWith("practice_"))) {
    completed.add("practice_conversation");
  }
  if (hasRows(courseResult)) completed.add("complete_course");
  if (hasRows(toolkitResult)) completed.add("save_toolkit_item");
  return completed;
}

function toMissionView(row: MissionRow): BetaMissionView | null {
  const definition = BETA_MISSION_DEFINITIONS[row.mission_key as BetaMissionKey];
  if (!definition) return null;
  return {
    ...definition,
    id: row.id,
    position: row.position,
    status: row.status,
    completionSource: row.completion_source,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
    feedbackRating: row.feedback_rating,
    feedbackComment: row.feedback_comment,
  };
}

export async function getBetaMissions(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: BetaMissionsResponse | null; error: string | null; newlyCompleted: BetaMissionKey[] }> {
  const order = getBetaMissionOrder(userId);
  const now = new Date().toISOString();
  const rowsToCreate = order.map((missionKey, position) => ({
    user_id: userId,
    mission_key: missionKey,
    position,
    status: "active",
    updated_at: now,
  }));

  const { error: assignmentError } = await supabase
    .from("beta_mission_assignments")
    .upsert(rowsToCreate, { onConflict: "user_id,mission_key", ignoreDuplicates: true });
  if (assignmentError) return { data: null, error: assignmentError.message, newlyCompleted: [] };

  const automaticallyCompleted = await getAutomaticallyCompletedMissions(supabase, userId);
  const { data: beforeRows, error: beforeError } = await supabase
    .from("beta_mission_assignments")
    .select("id, user_id, mission_key, position, status, completion_source, completed_at, skipped_at, feedback_rating, feedback_comment, presented_at")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (beforeError) return { data: null, error: beforeError.message, newlyCompleted: [] };

  const newlyCompleted = (beforeRows || [])
    .filter((row) => row.status === "active" && automaticallyCompleted.has(row.mission_key as BetaMissionKey))
    .map((row) => row.mission_key as BetaMissionKey);

  if (newlyCompleted.length) {
    const { error: completionError } = await supabase
      .from("beta_mission_assignments")
      .update({
        status: "completed",
        completion_source: "automatic",
        completed_at: now,
        skipped_at: null,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("status", "active")
      .in("mission_key", newlyCompleted);
    if (completionError) return { data: null, error: completionError.message, newlyCompleted: [] };
  }

  const { data: finalRows, error: finalError } = await supabase
    .from("beta_mission_assignments")
    .select("id, user_id, mission_key, position, status, completion_source, completed_at, skipped_at, feedback_rating, feedback_comment, presented_at")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (finalError) return { data: null, error: finalError.message, newlyCompleted: [] };

  const rows = (finalRows || []) as MissionRow[];
  const visibleRows = rows.filter((row) => row.status === "active").slice(0, 3);
  const newlyPresentedKeys = visibleRows
    .filter((row) => !row.presented_at)
    .map((row) => row.mission_key);
  if (newlyPresentedKeys.length) {
    const { error: presentedError } = await supabase
      .from("beta_mission_assignments")
      .update({ presented_at: now, updated_at: now })
      .eq("user_id", userId)
      .is("presented_at", null)
      .in("mission_key", newlyPresentedKeys);
    if (presentedError) return { data: null, error: presentedError.message, newlyCompleted: [] };
  }

  const missions = rows.map(toMissionView).filter((mission): mission is BetaMissionView => Boolean(mission));
  return {
    data: {
      missions,
      visibleMissions: missions.filter((mission) => mission.status === "active").slice(0, 3),
      completedCount: missions.filter((mission) => mission.status === "completed").length,
      skippedCount: missions.filter((mission) => mission.status === "skipped").length,
      totalCount: missions.length,
    },
    error: null,
    newlyCompleted,
  };
}
