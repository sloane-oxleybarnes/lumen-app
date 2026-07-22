"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Event = { id: string; title: string; start: string; attendees: Array<{ name: string | null; email: string | null }> };
type Calendar = { connected: boolean; reauthorize?: boolean; events: Event[] };

export default function TodayGuide() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/calendar/events", { cache: "no-store" });
    const data = await response.json().catch(() => null) as Calendar | null;
    if (response.ok && data) { setCalendar(data); setUpdatedAt(new Date()); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5 * 60_000); return () => clearInterval(timer); }, [load]);
  const today = calendar?.events.filter((event) => new Date(event.start).toDateString() === new Date().toDateString()) || [];
  return <section className="mb-6 rounded-card border border-primary/20 bg-primary-light/40 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-primary">Today with Beckett</p><h2 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Your day, in one place</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-mid">Beckett refreshes this view while it is open. It can use the calendar and support choices you connect; proactive notifications remain off unless you enable them.</p></div><button type="button" onClick={() => void load()} className="text-xs font-medium text-primary hover:underline">Refresh</button></div>{calendar?.connected ? <div className="mt-5"><p className="text-sm font-medium text-ink">{today.length ? `You have ${today.length} calendar ${today.length === 1 ? "item" : "items"} today.` : "Your calendar is clear today."}</p>{today.slice(0, 3).map((event) => <div key={event.id} className="mt-3 rounded-sm border border-border bg-white p-3"><p className="text-sm font-medium text-ink">{event.title}</p><p className="mt-1 text-xs text-ink-mid">{new Date(event.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p><Link href={`/dashboard/meeting-prep?title=${encodeURIComponent(event.title)}&attendees=${encodeURIComponent(event.attendees.map((attendee) => attendee.name || attendee.email || "Guest").join(", "))}`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Prep for this meeting →</Link></div>)}</div> : <div className="mt-5 rounded-sm border border-border bg-white p-4 text-sm text-ink-mid">Connect Google Calendar to let Today show your schedule and offer meeting preparation. <Link href="/dashboard/calendar" className="font-medium text-primary hover:underline">Connect calendar →</Link></div>}<div className="mt-5 flex flex-wrap gap-4 text-xs font-medium text-primary"><Link href="/dashboard/workday" className="hover:underline">View patterns & support plans →</Link><Link href="/dashboard/settings" className="hover:underline">Daily Guide settings →</Link>{updatedAt && <span className="text-ink-light">Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}</div></section>;
}
