import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/server-admin";
import { trackBetaEvent } from "@/lib/beta-events";

export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const completedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      dashboard_walkthrough_completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await trackBetaEvent({
    userId: user.id,
    email: user.email,
    eventName: "dashboard_walkthrough_completed",
    source: "web_app",
  });

  return NextResponse.json({ ok: true });
}
