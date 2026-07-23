import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { decryptGoogleAccessToken, encryptGoogleAccessToken } from "@/lib/google-token-security";
import {
  getGoogleCalendarOAuthConfig,
  parseGoogleCalendarCredential,
  refreshGoogleCalendarCredential,
} from "@/lib/google-calendar-oauth";

const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

function selectedCalendarIds(metadata: unknown) {
  const ids = typeof metadata === "object" && metadata && Array.isArray((metadata as { selectedCalendarIds?: unknown }).selectedCalendarIds)
    ? (metadata as { selectedCalendarIds: unknown[] }).selectedCalendarIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return ids.length ? ids.slice(0, 10) : ["primary"];
}

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: Array<{
    self?: boolean;
    displayName?: string;
    email?: string;
    responseStatus?: string;
  }>;
};

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("user_integrations")
    .select("id, access_token, metadata")
    .eq("user_id", session.user.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json({ error: "Could not read the calendar connection." }, { status: 500 });
  }

  const serializedCredential = decryptGoogleAccessToken(integration?.access_token);
  let credential = parseGoogleCalendarCredential(serializedCredential);
  const oauthConfig = getGoogleCalendarOAuthConfig(new URL(request.url).origin);
  if (!integration || !credential || !oauthConfig) {
    return NextResponse.json({ connected: false, events: [] });
  }

  if (credential.expiresAt <= Date.now() + 60_000) {
    const refreshed = await refreshGoogleCalendarCredential(credential, oauthConfig.clientId, oauthConfig.clientSecret);
    if (!refreshed) return NextResponse.json({ connected: true, reauthorize: true, events: [] });
    credential = refreshed;
    await supabaseAdmin
      .from("user_integrations")
      .update({ access_token: encryptGoogleAccessToken(JSON.stringify(credential)), updated_at: new Date().toISOString() })
      .eq("id", integration.id);
  }

  const url = new URL(request.url);
  const defaultStart = new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const requestedStart = url.searchParams.get("from");
  const requestedEnd = url.searchParams.get("to");
  const parsedStart = requestedStart ? new Date(requestedStart) : defaultStart;
  const parsedEnd = requestedEnd ? new Date(requestedEnd) : defaultEnd;
  const maxRange = 14 * 24 * 60 * 60 * 1000;
  const hasValidRequestedRange = !Number.isNaN(parsedStart.getTime())
    && !Number.isNaN(parsedEnd.getTime())
    && parsedEnd.getTime() > parsedStart.getTime()
    && parsedEnd.getTime() - parsedStart.getTime() <= maxRange;
  const timeMin = hasValidRequestedRange ? parsedStart : defaultStart;
  const timeMax = hasValidRequestedRange ? parsedEnd : defaultEnd;
  const calendarIds = selectedCalendarIds(integration.metadata);
  try {
    const responses = await Promise.all(calendarIds.map(async (calendarId) => {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
        fields: "items(id,summary,start(dateTime),end(dateTime),attendees(self,displayName,email,responseStatus))",
      });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${credential.accessToken}` }, cache: "no-store" }
      );
      return { calendarId, response };
    }));

    if (responses.some(({ response }) => response.status === 401 || response.status === 403)) {
      return NextResponse.json({ connected: true, reauthorize: true, events: [] });
    }
    if (responses.some(({ response }) => !response.ok)) {
      return NextResponse.json({ error: "Google Calendar could not load your events." }, { status: 502 });
    }

    const eventGroups = await Promise.all(responses.map(async ({ calendarId, response }) => ({
      calendarId,
      items: ((await response.json()) as { items?: GoogleCalendarEvent[] }).items || [],
    })));
    const events = eventGroups.flatMap(({ calendarId, items }) => items
      .filter((event) => event.id && event.start?.dateTime)
      .map((event) => ({
        id: `${calendarId}:${event.id as string}`,
        title: event.summary?.trim() || "Untitled meeting",
        start: event.start?.dateTime as string,
        end: event.end?.dateTime || null,
        attendees: (event.attendees || [])
          .filter((attendee) => !attendee.self)
          .map((attendee) => ({
            name: attendee.displayName || null,
            email: attendee.email || null,
            responseStatus: attendee.responseStatus || null,
          })),
      })))
      .sort((first, second) => new Date(first.start).getTime() - new Date(second.start).getTime());

    return NextResponse.json({ connected: true, scope: CALENDAR_EVENTS_SCOPE, events });
  } catch {
    return NextResponse.json({ error: "Google Calendar could not be reached." }, { status: 502 });
  }
}
