import { NextResponse } from "next/server";
import { trackBetaEvent } from "@/lib/beta-events";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { decryptGoogleAccessToken } from "@/lib/google-token-security";

const CONNECTED_PROVIDERS = ["google", "slack"] as const;
type ConnectedProvider = (typeof CONNECTED_PROVIDERS)[number];

function isConnectedProvider(value: string): value is ConnectedProvider {
  return CONNECTED_PROVIDERS.includes(value as ConnectedProvider);
}

async function revokeProviderToken(provider: ConnectedProvider, token: string) {
  try {
    if (provider === "google") {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
      return;
    }

    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Local removal is still enough to stop Beckett from accessing this provider.
  }
}

export async function DELETE(_req: Request, { params }: { params: { provider: string } }) {
  if (!isConnectedProvider(params.provider)) {
    return NextResponse.json({ error: "Unsupported integration." }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: integration, error: readError } = await supabaseAdmin
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", session.user.id)
    .eq("provider", params.provider)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: "Could not read the integration." }, { status: 500 });

  if (integration?.access_token) {
    const token = params.provider === "google"
      ? decryptGoogleAccessToken(integration.access_token)
      : integration.access_token;
    if (token) await revokeProviderToken(params.provider, token);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("user_integrations")
    .delete()
    .eq("user_id", session.user.id)
    .eq("provider", params.provider);

  if (deleteError) return NextResponse.json({ error: "Could not disconnect the integration." }, { status: 500 });

  await trackBetaEvent({
    userId: session.user.id,
    email: session.user.email,
    eventName: `${params.provider}_disconnected`,
    source: "web_app",
  });

  return NextResponse.json({ ok: true });
}
