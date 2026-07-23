import { NextResponse } from "next/server";
import { decryptGoogleAccessToken } from "@/lib/google-token-security";
import { trackBetaEvent } from "@/lib/beta-events";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function revokeGoogleToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Local removal is still enough to stop Beckett access.
  }
}

export async function DELETE() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: integration, error: readError } = await supabaseAdmin
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not read the Google connection." }, { status: 500 });

  const token = decryptGoogleAccessToken(integration?.access_token);
  if (token) await revokeGoogleToken(token);

  const { error: deleteError } = await supabaseAdmin
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "google");
  if (deleteError) return NextResponse.json({ error: "Could not disconnect Google." }, { status: 500 });

  await trackBetaEvent({ userId: user.id, email: user.email, eventName: "google_disconnected", source: "web_app" });
  return NextResponse.json({ ok: true });
}
