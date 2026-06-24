import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/server-admin";
import { trackBetaEvent } from "@/lib/beta-events";
import { getPublicSiteUrl } from "@/lib/deployment-env";
import { getSlackOAuthWorkerUrl } from "@/lib/slack-oauth";

const REQUIRED_SLACK_USER_SCOPES = ["channels:history", "groups:history", "im:history", "mpim:history", "users:read"];

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

  const origin = getPublicSiteUrl(req.nextUrl.origin);
  const redirectUri = `${origin}/api/slack/callback`;
  const slackOAuthWorker = getSlackOAuthWorkerUrl();

  if (!slackOAuthWorker) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  const tokenRes = await fetch(slackOAuthWorker, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  }).catch(() => null);

  const tokenData = await tokenRes?.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
    scope?: string;
    authed_user?: { access_token?: string; id?: string; scope?: string };
    team?: { id?: string; name?: string };
  };

  if (!tokenRes?.ok || !tokenData.ok || !tokenData.authed_user?.access_token) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=auth_error", req.url));
  }

  const now = new Date().toISOString();
  const userScopes = splitSlackScopes(tokenData.authed_user?.scope);
  const botScopes = splitSlackScopes(tokenData.scope);
  const metadata = {
    ...tokenData,
    granted_user_scopes: userScopes,
    granted_bot_scopes: botScopes,
    required_user_scopes: REQUIRED_SLACK_USER_SCOPES,
    missing_user_scopes: REQUIRED_SLACK_USER_SCOPES.filter((scope) => !userScopes.includes(scope)),
    last_validated_at: now,
    last_failure_reason: null,
  };

  await supabaseAdmin.from("user_integrations").upsert(
    {
      user_id: session.user.id,
      provider: "slack",
      access_token: tokenData.authed_user.access_token,
      external_user_id: tokenData.authed_user.id || null,
      external_team_id: tokenData.team?.id || null,
      external_team_name: tokenData.team?.name || null,
      metadata,
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

function splitSlackScopes(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
