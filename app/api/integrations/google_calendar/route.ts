import { NextResponse } from "next/server";
import { decryptGoogleAccessToken } from "@/lib/google-token-security";
import { parseGoogleCalendarCredential } from "@/lib/google-calendar-oauth";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { trackBetaEvent } from "@/lib/beta-events";

async function revokeGoogleToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // The credential is still removed locally, which immediately stops Beckett access.
  }
}

export async function DELETE() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: integration, error: readError } = await supabaseAdmin
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", session.user.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (readError) return NextResponse.json({ error: "Could not read the calendar connection." }, { status: 500 });

  const credential = parseGoogleCalendarCredential(decryptGoogleAccessToken(integration?.access_token));
  if (credential) await revokeGoogleToken(credential.refreshToken);

  const { error: deleteError } = await supabaseAdmin
    .from("user_integrations")
    .delete()
    .eq("user_id", session.user.id)
    .eq("provider", "google_calendar");

  if (deleteError) return NextResponse.json({ error: "Could not disconnect Google Calendar." }, { status: 500 });

  await trackBetaEvent({
    userId: session.user.id,
    email: session.user.email,
    eventName: "calendar_disconnected",
    source: "web_app",
    metadata: { integration: "calendar" },
  });

  return NextResponse.json({ ok: true });
}
