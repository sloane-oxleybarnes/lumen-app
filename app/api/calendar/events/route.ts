import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { decryptGoogleAccessToken } from "@/lib/google-token-security";

const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", session.user.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json({ error: "Could not read the calendar connection." }, { status: 500 });
  }

  const accessToken = decryptGoogleAccessToken(integration?.access_token);
  if (!accessToken) {
    return NextResponse.json({ connected: false, events: [] });
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
    fields: "items(id,summary,start(dateTime),end(dateTime),attendees(self,displayName,email,responseStatus))",
  });

  let calendarResponse: Response;
  try {
    calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
  } catch {
    return NextResponse.json({ error: "Google Calendar could not be reached." }, { status: 502 });
  }

  if (calendarResponse.status === 401 || calendarResponse.status === 403) {
    return NextResponse.json({ connected: true, reauthorize: true, events: [] });
  }

  if (!calendarResponse.ok) {
    return NextResponse.json({ error: "Google Calendar could not load your events." }, { status: 502 });
  }

  const payload = (await calendarResponse.json()) as { items?: GoogleCalendarEvent[] };
  const events = (payload.items || [])
    .filter((event) => event.id && event.start?.dateTime)
    .map((event) => ({
      id: event.id as string,
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
    }));

  return NextResponse.json({ connected: true, scope: CALENDAR_EVENTS_SCOPE, events });
}
