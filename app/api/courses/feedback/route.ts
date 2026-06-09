import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type CourseFeedbackBody = {
  courseId?: string;
  courseTitle?: string;
  rating?: "yes" | "no";
  useful?: string;
  off?: string;
  wouldUse?: string;
  preConfidence?: number | null;
  postConfidence?: number | null;
};

function truncate(value: unknown, max = 4000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CourseFeedbackBody;

  if (body.rating !== "yes" && body.rating !== "no") {
    return NextResponse.json({ error: "rating must be yes or no" }, { status: 400 });
  }

  const useful = truncate(body.useful);
  const off = truncate(body.off);
  const wouldUse = truncate(body.wouldUse);
  const comment = [
    useful ? `Most useful: ${useful}` : null,
    off ? `Felt off: ${off}` : null,
    wouldUse ? `Would use before real situation: ${wouldUse}` : null,
  ].filter(Boolean).join("\n\n");

  const { error } = await supabaseAdmin.from("beta_feedback").insert({
    user_id: user.id,
    rating: body.rating,
    comment,
    platform: "courses",
    mode: truncate(body.courseId, 100),
    source: "course",
    response_text: null,
    analysis_result: {},
    context_snapshot: {},
    metadata: {
      courseId: body.courseId || null,
      courseTitle: body.courseTitle || null,
      preConfidence: body.preConfidence ?? null,
      postConfidence: body.postConfidence ?? null,
      useful,
      off,
      wouldUse,
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
