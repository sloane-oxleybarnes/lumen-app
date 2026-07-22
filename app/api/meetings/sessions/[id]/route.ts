import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : null; }
function cleanList(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 300)).filter(Boolean).slice(0, 20) : []; }

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid meeting update." }, { status: 400 });
  const { data, error } = await supabase.from("meeting_sessions").update({
    user_notes: cleanText(body.user_notes, 8000),
    final_summary: cleanText(body.final_summary, 4000),
    follow_up_draft: cleanText(body.follow_up_draft, 4000),
    decisions: cleanList(body.decisions),
    open_questions: cleanList(body.open_questions),
    updated_at: new Date().toISOString(),
  }).eq("id", params.id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: "Could not save the meeting debrief." }, { status: 500 });
  return NextResponse.json({ session: data });
}
