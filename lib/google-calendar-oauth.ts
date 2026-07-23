import "server-only";

export const GOOGLE_CALENDAR_EVENT_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_CALENDAR_SCOPES = [GOOGLE_CALENDAR_EVENT_SCOPE, GOOGLE_CALENDAR_LIST_SCOPE];

export type GoogleCalendarCredential = {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function getGoogleCalendarOAuthConfig(origin: string) {
  const clientId = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/calendar/oauth/callback`,
  };
}

export function parseGoogleCalendarCredential(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<GoogleCalendarCredential>;
    if (
      parsed.version !== 1 ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed as GoogleCalendarCredential;
  } catch {
    return null;
  }
}

export async function refreshGoogleCalendarCredential(
  credential: GoogleCalendarCredential,
  clientId: string,
  clientSecret: string
) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token || typeof payload.expires_in !== "number") return null;

  return {
    ...credential,
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  } satisfies GoogleCalendarCredential;
}
