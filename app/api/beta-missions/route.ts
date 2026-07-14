import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getBetaMissions } from "@/lib/beta-missions-server";
import { getBetaMissionDefinition } from "@/lib/beta-missions";
import { trackBetaEvent } from "@/lib/beta-events";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getBetaMissions(supabase, user.id);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error || "Could not load beta missions." }, { status: 500 });
  }

  await Promise.all(result.newlyCompleted.map((missionKey) => trackBetaEvent({
    userId: user.id,
    email: user.email,
    eventName: "beta_mission_completed",
    source: "beta_missions",
    metadata: { missionKey, completionSource: "automatic" },
  })));

  return NextResponse.json(result.data);
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    missionKey?: string;
    action?: "complete" | "skip" | "feedback";
    skipReason?: string;
    rating?: "helpful" | "not_helpful";
    comment?: string;
  };
  const definition = getBetaMissionDefinition(body.missionKey || "");
  if (!definition || !body.action) {
    return NextResponse.json({ error: "Valid missionKey and action are required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  let update: Record<string, string | null>;
  let eventName: string;
  const eventMetadata: Record<string, string | null> = { missionKey: definition.key };

  if (body.action === "complete") {
    update = {
      status: "completed",
      completion_source: "self_reported",
      completed_at: now,
      skipped_at: null,
      updated_at: now,
    };
    eventName = "beta_mission_completed";
    eventMetadata.completionSource = "self_reported";
  } else if (body.action === "skip") {
    update = {
      status: "skipped",
      skipped_at: now,
      skip_reason: String(body.skipReason || "").trim().slice(0, 500) || null,
      updated_at: now,
    };
    eventName = "beta_mission_skipped";
    eventMetadata.hasReason = update.skip_reason ? "true" : "false";
  } else {
    if (body.rating !== "helpful" && body.rating !== "not_helpful") {
      return NextResponse.json({ error: "Choose helpful or not helpful." }, { status: 400 });
    }
    update = {
      feedback_rating: body.rating,
      feedback_comment: String(body.comment || "").trim().slice(0, 1000) || null,
      feedback_at: now,
      updated_at: now,
    };
    eventName = "beta_mission_feedback_submitted";
    eventMetadata.rating = body.rating;
    eventMetadata.hasComment = update.feedback_comment ? "true" : "false";
  }

  const { data, error } = await supabase
    .from("beta_mission_assignments")
    .update(update)
    .eq("user_id", user.id)
    .eq("mission_key", definition.key)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Mission not found." }, { status: 404 });

  await trackBetaEvent({
    userId: user.id,
    email: user.email,
    eventName,
    source: "beta_missions",
    metadata: eventMetadata,
  });

  const refreshed = await getBetaMissions(supabase, user.id);
  if (refreshed.error || !refreshed.data) {
    return NextResponse.json({ error: refreshed.error || "Could not refresh missions." }, { status: 500 });
  }
  return NextResponse.json(refreshed.data);
}
