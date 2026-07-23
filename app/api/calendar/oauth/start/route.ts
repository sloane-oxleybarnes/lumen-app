import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_CALENDAR_SCOPE, getGoogleCalendarOAuthConfig } from "@/lib/google-calendar-oauth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const COOKIE_PATH = "/api/calendar/oauth";
const MAX_AGE_SECONDS = 10 * 60;

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login?next=/dashboard/calendar", origin));
  }

  const config = getGoogleCalendarOAuthConfig(origin);
  if (!config) {
    return NextResponse.redirect(new URL("/dashboard/calendar?calendar=configuration-required", origin));
  }

  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  const options = { httpOnly: true, sameSite: "lax" as const, secure: true, path: COOKIE_PATH, maxAge: MAX_AGE_SECONDS };
  response.cookies.set("beckett_calendar_state", state, options);
  response.cookies.set("beckett_calendar_verifier", verifier, options);
  response.cookies.set("beckett_calendar_user", session.user.id, options);
  return response;
}
