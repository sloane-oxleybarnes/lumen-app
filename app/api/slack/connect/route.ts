import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getPublicSiteUrl } from "@/lib/deployment-env";

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

  const origin = getPublicSiteUrl(req.nextUrl.origin);
  const redirectUri = `${origin}/api/slack/callback`;
  const state = crypto.randomUUID();
  const authRes = await fetch(
    `${SLACK_OAUTH_WORKER}/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`
  );

  if (!authRes.ok) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  const authData = (await authRes.json()) as { auth_url?: string; error?: string };
  if (!authData.auth_url) {
    return NextResponse.redirect(new URL("/dashboard/settings?slack=setup_error", req.url));
  }

  const url = new URL(authData.auth_url);
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
