import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { beckettBoundaryPrompt } from "@/lib/beckett-boundaries";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSafetyResponse } from "@/lib/safety-resources";

type Action = "decode" | "draft";

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null) as { action?: unknown; text?: unknown; warmth?: unknown; directness?: unknown; formality?: unknown; length?: unknown } | null;
  const action = body?.action === "decode" || body?.action === "draft" ? body.action as Action : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!action || !text || text.length > 5000) return NextResponse.json({ error: "Choose Decode or Draft and add up to 5,000 characters." }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("safety_resource_region")
    .eq("id", user.id)
    .maybeSingle();
  const safety = getSafetyResponse(text, profile?.safety_resource_region);
  if (safety) return NextResponse.json({ safety, response: null });

  const warmth = typeof body?.warmth === "string" ? body.warmth.slice(0, 30) : "warm";
  const directness = typeof body?.directness === "string" ? body.directness.slice(0, 30) : "balanced";
  const formality = typeof body?.formality === "string" ? body.formality.slice(0, 30) : "natural";
  const length = typeof body?.length === "string" ? body.length.slice(0, 30) : "concise";
  const task = action === "decode"
    ? "Explain the most plausible meanings and tone based only on the supplied text. State uncertainty clearly, name what cannot be known, then offer practical next steps."
    : "Write three ready-to-send options that preserve the user’s intent. Label them Direct, Warm, and Balanced. Do not claim to send anything.";
  const system = `You are Beckett, a personalized communication coach for neurodivergent adults. ${task}\n\n${beckettBoundaryPrompt()}\n\nDo not diagnose people or infer hidden intent as fact. Be practical, respectful, and under 350 words.`;
  const prompt = `Communication settings: directness ${directness}; warmth ${warmth}; formality ${formality}; length ${length}.\n\nUser-provided text or situation:\n${text}`;

  try {
    await recordAiUsage(user.id, { source: "web_coach", action: `coach_${action}`, metadata: { directness, warmth, formality, length } });
    const response = await callAnthropic(system, [{ role: "user", content: prompt }], 900);
    return NextResponse.json({ response: response.trim(), safety: null });
  } catch (error) {
    if (error instanceof AiUsageLimitError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Beckett could not prepare coaching right now." }, { status: 502 });
  }
}
