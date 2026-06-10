import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { trackBetaEvent } from "@/lib/beta-events";

const ALLOWED_EVENTS = new Set([
  "course_completed",
  "dashboard_viewed",
  "settings_health_check_started",
]);

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    eventName?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.eventName || !ALLOWED_EVENTS.has(body.eventName)) {
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }

  await trackBetaEvent({
    userId: user.id,
    email: user.email,
    eventName: body.eventName,
    source: body.source || "web_app",
    metadata: body.metadata || {},
  });

  return NextResponse.json({ ok: true });
}
