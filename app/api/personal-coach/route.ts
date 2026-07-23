import { NextRequest, NextResponse } from "next/server";
import { callAnthropic } from "@/lib/anthropic";
import { AiUsageLimitError, recordAiUsage } from "@/lib/ai-usage";
import { beckettBoundaryPrompt } from "@/lib/beckett-boundaries";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSafetyResponse } from "@/lib/safety-resources";

const pillars = ["boundaries", "friendship", "family_roommates", "dating"] as const;
const intents = ["decode", "draft"] as const;
type Pillar = (typeof pillars)[number];

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null) as { text?: unknown; pillar?: unknown; intent?: unknown; tone?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000 || !isOneOf(pillars, body?.pillar) || !isOneOf(intents, body?.intent)) {
    return NextResponse.json({ error: "Choose a support area and add up to 4,000 characters of context." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("safety_resource_region")
    .eq("id", user.id)
    .maybeSingle();
  const safety = getSafetyResponse(text, profile?.safety_resource_region);
  if (safety) return NextResponse.json({ safety, response: null });

  const tone = typeof body?.tone === "string" ? body.tone.slice(0, 80) : "warm and direct";
  const pillarName: Record<Pillar, string> = {
    boundaries: "boundaries and conflict",
    friendship: "friendship and connection",
    family_roommates: "family or roommate communication",
    dating: "dating and early relationships",
  };
  const task = body.intent === "decode"
    ? "Explain likely meanings and tone using only what is visible, then offer two low-pressure ways the user could respond."
    : "Draft two concise, ready-to-send options that preserve the user's intent: one direct and one warmer.";
  const system = `You are Beckett, a personalized communication coach for neurodivergent adults. This is personal communication support in the area of ${pillarName[body.pillar]}.\n\n${beckettBoundaryPrompt()}\n\nUse uncertainty when evidence is limited. Do not diagnose, provide therapy, legal guidance, crisis intervention, medical guidance, manipulation, or advice for coercive/unsafe relationships. Keep your response practical, kind, and under 300 words.`;
  const prompt = `Task: ${task}\nPreferred tone: ${tone}.\n\nUser-provided context:\n${text}`;

  try {
    await recordAiUsage(user.id, { source: "personal_coach", action: `personal_${body.intent}`, metadata: { pillar: body.pillar } });
    const response = await callAnthropic(system, [{ role: "user", content: prompt }], 700);
    return NextResponse.json({ response: response.trim(), safety: null });
  } catch (error) {
    if (error instanceof AiUsageLimitError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Beckett could not prepare coaching right now." }, { status: 502 });
  }
}
