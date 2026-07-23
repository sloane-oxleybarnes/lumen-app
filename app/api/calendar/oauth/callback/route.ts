import { NextRequest, NextResponse } from "next/server";
import { encryptGoogleAccessToken } from "@/lib/google-token-security";
import { GOOGLE_CALENDAR_SCOPES, getGoogleCalendarOAuthConfig } from "@/lib/google-calendar-oauth";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { trackBetaEvent } from "@/lib/beta-events";

const COOKIE_PATH = "/api/calendar/oauth";

function completeRedirect(origin: string, status: string, returnTo = "/dashboard/calendar") {
  const response = NextResponse.redirect(new URL(`${returnTo}?calendar=${encodeURIComponent(status)}`, origin));
  for (const name of ["beckett_calendar_state", "beckett_calendar_verifier", "beckett_calendar_user", "beckett_calendar_next"]) {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: true, path: COOKIE_PATH, maxAge: 0 });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const returnTo = request.cookies.get("beckett_calendar_next")?.value === "/dashboard/settings" ? "/dashboard/settings" : "/dashboard/calendar";
  const error = searchParams.get("error");
  if (error) return completeRedirect(origin, error === "access_denied" ? "cancelled" : "authorization-failed", returnTo);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("beckett_calendar_state")?.value;
  const verifier = request.cookies.get("beckett_calendar_verifier")?.value;
  const expectedUserId = request.cookies.get("beckett_calendar_user")?.value;
  if (!code || !state || !expectedState || state !== expectedState || !verifier || !expectedUserId) {
    return completeRedirect(origin, "authorization-failed", returnTo);
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== expectedUserId) return completeRedirect(origin, "session-expired", returnTo);

  const config = getGoogleCalendarOAuthConfig(origin);
  if (!config) return completeRedirect(origin, "configuration-required", returnTo);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) return completeRedirect(origin, "authorization-failed", returnTo);

  const token = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!token.access_token || !token.refresh_token || typeof token.expires_in !== "number") {
    return completeRedirect(origin, "authorization-failed", returnTo);
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin.from("user_integrations").upsert(
    {
      user_id: user.id,
      provider: "google_calendar",
      access_token: encryptGoogleAccessToken(JSON.stringify({
        version: 1,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
      })),
      external_user_id: user.email || null,
      external_team_id: null,
      external_team_name: null,
      metadata: {
        provider: "google_calendar",
        scopes: GOOGLE_CALENDAR_SCOPES.map((scope) => scope.replace("https://www.googleapis.com/auth/", "")).join(" "),
        selectedCalendarIds: ["primary"],
        token_encryption: "aes-256-gcm:v1",
      },
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,provider" }
  );
  if (upsertError) return completeRedirect(origin, "connection-failed", returnTo);

  await trackBetaEvent({ userId: user.id, email: user.email, eventName: "calendar_connected", source: "web_app", metadata: { integration: "calendar" } });
  return completeRedirect(origin, "connected", returnTo);
}
