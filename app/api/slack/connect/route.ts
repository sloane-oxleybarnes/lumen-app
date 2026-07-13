import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSlackOAuthWorkerUrl, getSlackRedirectOrigin } from "@/lib/slack-oauth";

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login?next=/dashboard/settings", req.url));
  }

  const origin = getSlackRedirectOrigin();
  const redirectUri = `${origin}/api/slack/callback`;
  const state = crypto.randomUUID();
  const slackOAuthWorker = getSlackOAuthWorkerUrl();

  if (!slackOAuthWorker) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  const authRes = await fetch(
    `${slackOAuthWorker}/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`,
    { cache: "no-store" }
  ).catch(() => null);

  if (!authRes?.ok) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  const authData = (await authRes.json().catch(() => ({}))) as { auth_url?: string; error?: string };
  if (!authData.auth_url) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  let url: URL;
  try {
    url = new URL(authData.auth_url);
  } catch {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("beckett_slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
