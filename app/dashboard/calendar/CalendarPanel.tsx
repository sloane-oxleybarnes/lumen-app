"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  attendees: Array<{
    name: string | null;
    email: string | null;
    responseStatus: string | null;
  }>;
};

type CalendarResponse = {
  connected: boolean;
  reauthorize?: boolean;
  events: CalendarEvent[];
};

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function attendeeLabel(attendee: CalendarEvent["attendees"][number]) {
  return attendee.name || attendee.email || "Guest";
}

export default function CalendarPanel() {
  const supabase = createClient();
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/events", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as CalendarResponse & { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not load your calendar.");
      setCalendar(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  async function connectCalendar() {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events.readonly",
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard/calendar")}&integration=calendar`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    });
    if (authError) setError(authError.message);
  }

  async function disconnectCalendar() {
    const confirmed = window.confirm(
      "Disconnect Google Calendar? Beckett will stop reading upcoming events. Existing coaching history and contacts will not be deleted."
    );
    if (!confirmed) return;

    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google_calendar", { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not disconnect Google Calendar.");
      await loadCalendar();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disconnect Google Calendar.");
    } finally {
      setDisconnecting(false);
    }
  }

  const needsConnection = !calendar?.connected || calendar.reauthorize;

  return (
    <div className="max-w-3xl">
      <h1
        className="text-3xl text-ink mb-2"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        Calendar
      </h1>
      <p className="text-ink-mid text-sm mb-8">
        See what is coming up and prepare before you walk in.
      </p>
      <div className="mb-5 flex flex-wrap gap-4 text-sm font-medium text-primary">
        <Link href="/dashboard/meeting-prep" className="hover:underline">Prepare for a meeting →</Link>
        <Link href="/dashboard/meetings" className="hover:underline">Open Meeting Companion →</Link>
      </div>

      <div className="mb-5 rounded-sm border border-primary/15 bg-primary-light/40 p-4 text-sm leading-relaxed text-ink-mid">
        Beckett reads upcoming event titles, timing, and attendees to give you basic meeting context.
        It cannot create, edit, cancel, or respond to calendar events, and it does not store your events.
      </div>

      {calendar?.connected && !calendar.reauthorize && (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => void disconnectCalendar()}
            disabled={disconnecting}
            className="text-xs font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect Google Calendar"}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-card border border-border bg-white p-8 text-sm text-ink-mid">
          Loading your calendar…
        </div>
      ) : needsConnection ? (
        <div className="rounded-card border border-border bg-white p-8 text-center">
          <p className="mb-3 text-3xl">📅</p>
          <h2 className="mb-2 text-lg font-medium text-ink">
            {calendar?.reauthorize ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </h2>
          <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-ink-mid">
            Give Beckett read-only access to your upcoming events so you can see meeting titles,
            timing, and attendees in one place.
          </p>
          <button
            type="button"
            onClick={() => void connectCalendar()}
            className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            {calendar?.reauthorize ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </button>
        </div>
      ) : calendar.events.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-8 text-center">
          <p className="mb-2 text-lg font-medium text-ink">No upcoming meetings this week</p>
          <p className="text-sm text-ink-mid">When a timed calendar event is coming up, it will appear here.</p>
        </div>
      ) : (
        <section className="rounded-card border border-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
              Upcoming meetings
            </h2>
            <button
              type="button"
              onClick={() => void loadCalendar()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-3">
            {calendar.events.map((event) => (
              <article key={event.id} className="rounded-sm border border-border bg-bg/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">{formatEventTime(event.start)}</p>
                <h3 className="mt-1 text-base font-medium text-ink">{event.title}</h3>
                <p className="mt-2 text-xs text-ink-light">
                  {event.attendees.length
                    ? `${event.attendees.slice(0, 4).map(attendeeLabel).join(", ")}${event.attendees.length > 4 ? ` +${event.attendees.length - 4}` : ""}`
                    : "No other attendees listed"}
                </p>
                <Link href={`/dashboard/meeting-prep?title=${encodeURIComponent(event.title)}&attendees=${encodeURIComponent(event.attendees.map(attendeeLabel).join(", "))}`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Prepare with Beckett →</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
