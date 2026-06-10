import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/server-admin";
import { trackBetaEvent } from "@/lib/beta-events";

const SLACK_OAUTH_WORKER =
  process.env.SLACK_OAUTH_WORKER_URL || "https://lumen-slack.sloane-oxleyhase.workers.dev";

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login?next=/dashboard/settings", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("beckett_slack_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=auth_error", req.url));
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const redirectUri = `${origin}/api/slack/callback`;
  const tokenRes = await fetch(SLACK_OAUTH_WORKER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  const tokenData = await tokenRes.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
    authed_user?: { access_token?: string; id?: string };
    team?: { id?: string; name?: string };
  };

  if (!tokenRes.ok || !tokenData.ok || !tokenData.authed_user?.access_token) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=auth_error", req.url));
  }

  const now = new Date().toISOString();
  await supabaseAdmin.from("user_integrations").upsert(
    {
      user_id: session.user.id,
      provider: "slack",
      access_token: tokenData.authed_user.access_token,
      external_user_id: tokenData.authed_user.id || null,
      external_team_id: tokenData.team?.id || null,
      external_team_name: tokenData.team?.name || null,
      metadata: tokenData,
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,provider" }
  );

  await trackBetaEvent({
    userId: session.user.id,
    email: session.user.email,
    eventName: "slack_connected",
    source: "web_app",
    metadata: {
      teamId: tokenData.team?.id || null,
      teamName: tokenData.team?.name || null,
    },
  });

  const response = NextResponse.redirect(new URL("/dashboard/settings?slack=connected", req.url));
  response.cookies.delete("beckett_slack_oauth_state");
  return response;
}
