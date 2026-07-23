"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  attendeeNames,
  formatEventTime,
  hasOtherAttendees,
  type CalendarEvent,
} from "@/lib/calendar-insights";

type CalendarResponse = {
  connected: boolean;
  reauthorize?: boolean;
  events: CalendarEvent[];
};

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "numeric", day: "numeric" }).format(date);
}

function prepHref(event: CalendarEvent) {
  return `/dashboard/meeting-prep?title=${encodeURIComponent(event.title)}&attendees=${encodeURIComponent(attendeeNames(event).join(", "))}`;
}

export default function CalendarPanel() {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    try {
      const response = await fetch(`/api/calendar/events?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(weekEnd.toISOString())}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as CalendarResponse & { error?: string } | null;
      if (!response.ok || !data) throw new Error(data?.error || "Could not load your calendar.");
      setCalendar(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendar();
    const timer = window.setInterval(() => void loadCalendar(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadCalendar();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadCalendar]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("calendar");
    if (!status) return;
    if (status === "connected") setError(null);
    else if (status === "cancelled") setError("Calendar connection was cancelled.");
    else if (status === "configuration-required") setError("Calendar connection is still being configured. Please try again shortly.");
    else setError("Calendar connection could not be completed. Please try again.");
    window.history.replaceState({}, "", "/dashboard/calendar");
  }, []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, []);
  const prepCandidates = useMemo(
    () => (calendar?.events || []).filter((event) => hasOtherAttendees(event) && new Date(event.start).getTime() >= Date.now()).slice(0, 3),
    [calendar]
  );
  const needsConnection = !calendar?.connected || calendar.reauthorize;

  return (
    <div className="max-w-6xl">
      <h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Calendar &amp; meetings</h1>
      <p className="mb-6 text-sm text-ink-mid">See this week at a glance and prepare for the conversations that are actually on your calendar.</p>
      <div className="mb-5 flex flex-wrap gap-4 text-sm font-medium text-primary">
        <Link href="/dashboard/meetings" className="hover:underline">Meeting notes &amp; support →</Link>
      </div>

      <div className="mb-5 rounded-sm border border-primary/15 bg-primary-light/40 p-4 text-sm leading-relaxed text-ink-mid">
        Beckett reads selected calendar event titles, timing, and attendees to show your week and offer meeting context. It does not create, edit, cancel, or respond to calendar events, and it does not store your events.
      </div>

      {error && <div className="mb-5 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-card border border-border bg-white p-8 text-sm text-ink-mid">Loading your calendar…</div>
      ) : needsConnection ? (
        <div className="rounded-card border border-border bg-white p-8 text-center">
          <p className="mb-3 text-3xl">📅</p>
          <h2 className="mb-2 text-lg font-medium text-ink">Manage Google Calendar</h2>
          <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-ink-mid">Connect or manage Google Calendar in Settings. Beckett uses only the calendars you choose there.</p>
          <button type="button" onClick={() => window.location.assign("/dashboard/settings#connected-accounts")} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark">Open Connected accounts</button>
        </div>
      ) : (
        <>
          <section className="mb-5 rounded-card border border-border bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Suggested meeting prep</p>
                <h2 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Worth a few minutes before you join</h2>
              </div>
              <button type="button" onClick={() => void loadCalendar()} className="text-xs font-medium text-primary hover:underline">Refresh</button>
            </div>
            {prepCandidates.length ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {prepCandidates.map((event) => <article key={event.id} className="rounded-sm border border-border bg-bg/50 p-4"><p className="text-xs font-medium text-primary">{new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.start))}</p><h3 className="mt-1 text-sm font-medium text-ink">{event.title}</h3><p className="mt-1 text-xs text-ink-mid">With {attendeeNames(event).slice(0, 3).join(", ")}{event.attendees.length > 3 ? " and others" : ""}</p><Link href={prepHref(event)} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Prep for this meeting →</Link></article>)}
              </div>
            ) : <p className="rounded-sm border border-border bg-bg/50 p-4 text-sm text-ink-mid">There are no upcoming meetings with other attendees in this week&apos;s view, so there is nothing to prepare for yet.</p>}
          </section>

          <section className="rounded-card border border-border bg-white p-5 sm:p-6">
            <div className="mb-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">This week</p><h2 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Your calendar</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {weekDays.map((day) => {
                const events = (calendar?.events || []).filter((event) => new Date(event.start).toDateString() === day.toDateString());
                const isToday = day.toDateString() === new Date().toDateString();
                return <section key={day.toISOString()} className={`min-h-40 rounded-sm border p-3 ${isToday ? "border-primary/40 bg-primary-light/30" : "border-border bg-bg/40"}`}><p className={`text-xs font-medium ${isToday ? "text-primary" : "text-ink-light"}`}>{formatDay(day)}</p><div className="mt-3 space-y-2">{events.length ? events.map((event) => <article key={event.id} className="rounded-sm border border-border bg-white p-2"><p className="text-[11px] font-medium text-primary">{formatEventTime(event.start)}</p><p className="mt-0.5 text-xs font-medium leading-snug text-ink">{event.title}</p>{hasOtherAttendees(event) && <Link href={prepHref(event)} className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">Prep →</Link>}</article>) : <p className="text-xs text-ink-light">Open</p>}</div></section>;
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
