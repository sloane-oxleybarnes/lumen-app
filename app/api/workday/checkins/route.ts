import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  breakStatusValues,
  helpfulStrategyValues,
  makePatternSummaries,
  timeOfDayValues,
  workloadValues,
  type WorkdayCheckin,
} from "@/lib/workday-patterns";

const periodStart = () => new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const contains = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === "string" && values.includes(value);

async function currentUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [{ data: checkins, error: checkinsError }, { data: summaries, error: summariesError }] = await Promise.all([
    supabaseAdmin.from("workday_checkins").select("*").eq("user_id", user.id).gte("checked_in_at", periodStart()).order("checked_in_at", { ascending: false }),
    supabaseAdmin.from("workday_pattern_summaries").select("*").eq("user_id", user.id).order("generated_at", { ascending: false }),
  ]);
  if (checkinsError || summariesError) {
    return NextResponse.json({ error: "Workday coaching is not set up yet. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ checkins: checkins || [], summaries: summaries || [] });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as WorkdayCheckin | null;
  if (!body || !contains(timeOfDayValues, body.time_of_day) || !contains(workloadValues, body.workload_level) ||
    !Number.isInteger(body.energy_level) || body.energy_level < 1 || body.energy_level > 5 ||
    typeof body.communication_friction !== "boolean" || !contains(breakStatusValues, body.break_status) ||
    !contains(helpfulStrategyValues, body.helpful_strategy)) {
    return NextResponse.json({ error: "Please complete each structured check-in field." }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin.from("workday_checkins").insert({
    user_id: user.id,
    time_of_day: body.time_of_day,
    workload_level: body.workload_level,
    energy_level: body.energy_level,
    communication_friction: body.communication_friction,
    break_status: body.break_status,
    helpful_strategy: body.helpful_strategy,
  }).select("*").single();
  if (insertError) return NextResponse.json({ error: "Could not save your check-in." }, { status: 500 });

  const { data: profile } = await supabaseAdmin.from("profiles").select("pattern_model_enabled").eq("id", user.id).maybeSingle();
  let summaries: ReturnType<typeof makePatternSummaries> = [];
  if (profile?.pattern_model_enabled) {
    const { data: recent } = await supabaseAdmin.from("workday_checkins").select("*").eq("user_id", user.id).gte("checked_in_at", periodStart());
    summaries = makePatternSummaries((recent || []) as WorkdayCheckin[]);
    await supabaseAdmin.from("workday_pattern_summaries").delete().eq("user_id", user.id);
    if (summaries.length) await supabaseAdmin.from("workday_pattern_summaries").insert(summaries.map((summary) => ({ ...summary, user_id: user.id })));
  }

  return NextResponse.json({ checkin: inserted, summaries });
}
