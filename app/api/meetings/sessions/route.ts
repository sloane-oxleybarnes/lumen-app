import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data, error } = await supabase.from("meeting_sessions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: "Meeting Companion is not set up yet." }, { status: 503 });
  return NextResponse.json({ sessions: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = cleanText(body?.title, 200);
  if (!title) return NextResponse.json({ error: "A meeting title is required." }, { status: 400 });
  const { data, error } = await supabase.from("meeting_sessions").insert({
    user_id: user.id,
    title,
    source: body?.source === "calendar" ? "calendar" : "manual",
    scheduled_at: typeof body?.scheduled_at === "string" ? body.scheduled_at : null,
    retention_preference: ["do_not_save", "notes_only", "summary_only"].includes(String(body?.retention_preference)) ? body?.retention_preference : "summary_only",
  }).select("*").single();
  if (error) return NextResponse.json({ error: "Could not create the meeting session." }, { status: 500 });
  return NextResponse.json({ session: data }, { status: 201 });
}
