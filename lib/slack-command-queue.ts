import { supabaseAdmin } from "@/lib/server-admin";

type SlackCommandIntent = "respond" | "rewrite" | "decode" | "prep" | "practice";
type SlackCommandJobStatus = "processing" | "completed" | "failed";

type ReservationRow = {
  job_id: string;
  scheduled_at: string;
  is_duplicate: boolean;
};

const DEFAULT_SPACING_MS = 4_000;
const MAX_WAIT_MS = 60_000;

function commandSpacingMs() {
  const configured = Number(process.env.SLACK_COMMAND_SPACING_MS || DEFAULT_SPACING_MS);
  if (!Number.isFinite(configured)) return DEFAULT_SPACING_MS;
  return Math.min(15_000, Math.max(1_000, Math.round(configured)));
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runQueuedSlackCommand({
  requestKey,
  teamId,
  slackUserId,
  intent,
  task,
}: {
  requestKey: string;
  teamId: string;
  slackUserId: string;
  intent: SlackCommandIntent;
  task: () => Promise<void>;
}) {
  const { data, error } = await supabaseAdmin.rpc("reserve_slack_command_job", {
    p_request_key: requestKey,
    p_slack_team_id: teamId,
    p_slack_user_id: slackUserId,
    p_intent: intent,
    p_spacing_ms: commandSpacingMs(),
  });

  if (error) throw new Error(`Slack command queue reservation failed: ${error.message}`);

  const reservation = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
  if (!reservation?.job_id || !reservation.scheduled_at) {
    throw new Error("Slack command queue reservation returned no job.");
  }

  if (reservation.is_duplicate) {
    console.info("Skipped duplicate Slack command delivery", {
      jobId: reservation.job_id,
      teamId,
      slackUserId,
      intent,
    });
    return;
  }

  const delayMs = Math.min(
    MAX_WAIT_MS,
    Math.max(0, Date.parse(reservation.scheduled_at) - Date.now())
  );
  if (delayMs > 0) await wait(delayMs);

  await updateJob(reservation.job_id, "processing");
  try {
    await task();
    await updateJob(reservation.job_id, "completed");
  } catch (taskError) {
    await updateJob(
      reservation.job_id,
      "failed",
      taskError instanceof Error ? taskError.message : String(taskError)
    ).catch((statusError) => {
      console.error("Slack command failure status update failed", {
        jobId: reservation.job_id,
        message: statusError instanceof Error ? statusError.message : String(statusError),
      });
    });
    throw taskError;
  }
}

async function updateJob(jobId: string, status: SlackCommandJobStatus, errorMessage?: string) {
  const now = new Date().toISOString();
  const values: Record<string, string | null> = {
    status,
    updated_at: now,
    error_message: errorMessage?.slice(0, 1_000) || null,
  };
  if (status === "processing") values.started_at = now;
  if (status === "completed" || status === "failed") values.completed_at = now;

  const { error } = await supabaseAdmin
    .from("slack_command_jobs")
    .update(values)
    .eq("id", jobId);
  if (error) throw new Error(`Slack command job status update failed: ${error.message}`);
}
