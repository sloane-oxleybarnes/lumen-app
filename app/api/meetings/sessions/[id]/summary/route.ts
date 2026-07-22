import { NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { beckettBoundaryPrompt } from "@/lib/beckett-boundaries";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: session, error } = await supabase.from("meeting_sessions").select("title, user_notes, decisions, open_questions").eq("id", params.id).eq("user_id", user.id).single();
  if (error || !session) return NextResponse.json({ error: "Meeting session not found." }, { status: 404 });
  if (!session.user_notes?.trim() && !(session.decisions as unknown[]).length && !(session.open_questions as unknown[]).length) {
    return NextResponse.json({ error: "Add notes, decisions, or open questions before asking Beckett to summarize." }, { status: 400 });
  }
  try {
    await recordAiUsage(user.id, { source: "meeting_companion", action: "meeting_notes_summary" });
    const text = await callAnthropic(
      `You are Beckett, a communication coach. Summarize only the user's selected meeting notes. Do not infer details not present. Do not give legal, medical, mental-health, HR, or crisis advice. ${beckettBoundaryPrompt()} Keep the result under 160 words, with concise headings for Summary, Decisions, and Open questions when applicable.`,
      [{ role: "user", content: `Meeting: ${session.title}\n\nUser notes:\n${session.user_notes || "None"}\n\nDecisions:\n${JSON.stringify(session.decisions)}\n\nOpen questions:\n${JSON.stringify(session.open_questions)}` }],
      350
    );
    return NextResponse.json({ summary: text.trim() });
  } catch (caught) {
    if (caught instanceof AiUsageLimitError) return NextResponse.json({ error: caught.message }, { status: caught.status });
    return NextResponse.json({ error: "Beckett could not summarize these notes right now." }, { status: 502 });
  }
}
