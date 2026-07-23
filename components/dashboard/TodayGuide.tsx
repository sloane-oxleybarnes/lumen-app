"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { timeOfDayForDate, type WorkdayCheckin } from "@/lib/workday-patterns";
import {
  attendeeNames,
  eventsOnDay,
  formatEventTime,
  getDaySuggestion,
  hasOtherAttendees,
  type CalendarEvent,
} from "@/lib/calendar-insights";

type Calendar = { connected: boolean; reauthorize?: boolean; events: CalendarEvent[] };
type Feeling = {
  value: string;
  label: string;
  symbol: string;
  checkin: Pick<WorkdayCheckin, "workload_level" | "energy_level" | "communication_friction" | "break_status" | "helpful_strategy">;
};

const feelings: Feeling[] = [
  { value: "steady", label: "Steady", symbol: "〰", checkin: { workload_level: "steady", energy_level: 3, communication_friction: false, break_status: "not_taken", helpful_strategy: "none_yet" } },
  { value: "low-energy", label: "Low energy", symbol: "▱", checkin: { workload_level: "steady", energy_level: 2, communication_friction: false, break_status: "would_help", helpful_strategy: "short_break" } },
  { value: "stressed", label: "Stressed", symbol: "✳", checkin: { workload_level: "stacked", energy_level: 2, communication_friction: true, break_status: "would_help", helpful_strategy: "clearer_priority" } },
  { value: "focused", label: "Focused", symbol: "◎", checkin: { workload_level: "steady", energy_level: 4, communication_friction: false, break_status: "not_taken", helpful_strategy: "quiet_block" } },
  { value: "overloaded", label: "Overloaded", symbol: "☁", checkin: { workload_level: "stacked", energy_level: 1, communication_friction: true, break_status: "would_help", helpful_strategy: "short_break" } },
];

function prepHref(event: CalendarEvent) {
  return `/dashboard/meeting-prep?title=${encodeURIComponent(event.title)}&attendees=${encodeURIComponent(attendeeNames(event).join(", "))}`;
}

export default function TodayGuide({ name }: { name: string }) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState<string | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/calendar/events", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as Calendar | null;
    if (response.ok && data) {
      setCalendar(data);
      setUpdatedAt(new Date());
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const today = useMemo(() => eventsOnDay(calendar?.events || [], new Date()), [calendar]);
  const suggestion = useMemo(() => getDaySuggestion(calendar?.events || [], new Date()), [calendar]);
  const nextMeetingToPrep = useMemo(() => today.filter((event) => new Date(event.start).getTime() >= Date.now()).find(hasOtherAttendees), [today]);

  async function selectFeeling(feeling: Feeling) {
    setSelectedFeeling(feeling.value);
    setCheckinStatus("saving");
    try {
      const response = await fetch("/api/workday/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...feeling.checkin, time_of_day: timeOfDayForDate() }),
      });
      if (!response.ok) throw new Error();
      setCheckinStatus("saved");
    } catch {
      setCheckinStatus("error");
    }
  }

  return (
    <section className="mb-6 space-y-5">
      <div className="rounded-card border border-border bg-white p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Today with Beckett</p>
        <h2 className="mt-2 text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {name}.</h2>
        <p className="mt-1 text-sm text-ink-mid">How are you feeling right now?</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {feelings.map((feeling) => <button key={feeling.value} type="button" onClick={() => void selectFeeling(feeling)} aria-pressed={selectedFeeling === feeling.value} disabled={checkinStatus === "saving"} className={`flex min-h-16 items-center gap-3 rounded-sm border px-3 text-left text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${selectedFeeling === feeling.value ? "border-primary bg-primary-light text-ink" : "border-border bg-bg/50 text-ink hover:border-primary/50 hover:bg-primary-light/40"}`}><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg text-primary">{feeling.symbol}</span>{feeling.label}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {checkinStatus === "saving" && <span className="text-ink-mid">Saving your check-in…</span>}
          {checkinStatus === "saved" && <span className="text-primary">Check-in saved at {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. You can check in again anytime.</span>}
          {checkinStatus === "error" && <span className="text-red-700">Your check-in did not save. Please try again.</span>}
          <Link href="/dashboard/workday" className="font-medium text-primary hover:underline">View patterns &amp; support plans →</Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Your day</p><h3 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>What&apos;s ahead</h3></div><button type="button" onClick={() => void load()} className="text-xs font-medium text-primary hover:underline">Refresh</button></div>
          {calendar?.connected && !calendar.reauthorize ? (
            today.length ? <div className="mt-5 space-y-3">{today.slice(0, 5).map((event) => <article key={event.id} className="rounded-sm border border-border bg-bg/60 p-4"><p className="text-xs font-medium text-primary">{formatEventTime(event.start)}</p><p className="mt-1 text-sm font-medium text-ink">{event.title}</p>{hasOtherAttendees(event) && <Link href={prepHref(event)} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Prep for this meeting →</Link>}</article>)}</div> : <p className="mt-5 rounded-sm border border-border bg-bg/60 p-4 text-sm text-ink-mid">Your calendar is clear today. What would help you make the day feel good?</p>
          ) : <div className="mt-5 rounded-sm border border-primary/20 bg-primary-light/40 p-4 text-sm leading-relaxed text-ink-mid">Connect Google Calendar to see your day here and prepare for upcoming meetings. <Link href="/dashboard/settings#connected-accounts" className="font-medium text-primary hover:underline">Connect calendar →</Link></div>}
          {updatedAt && <p className="mt-4 text-xs text-ink-light">Updated {formatEventTime(updatedAt.toISOString())}</p>}
        </div>

        <div className="space-y-5">
          {!suggestionDismissed && <div className="rounded-card border border-primary/20 bg-primary-light/40 p-5 sm:p-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">A schedule-based suggestion</p><h3 className="mt-2 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{calendar?.connected ? suggestion.title : "Start with what would help today."}</h3><p className="mt-2 text-sm leading-relaxed text-ink-mid">{calendar?.connected ? suggestion.detail : "Connect your calendar when you want Beckett to tailor this to your actual schedule."}</p><div className="mt-5 flex flex-wrap gap-3">{suggestion.kind === "prep" && suggestion.event ? <Link href={prepHref(suggestion.event)} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark">Prepare now</Link> : <Link href={suggestion.kind === "focus" || suggestion.kind === "open" ? "/dashboard/skills" : "/dashboard/workday"} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark">{suggestion.kind === "focus" || suggestion.kind === "open" ? "Choose a focus" : "Plan a reset"}</Link>}<button type="button" onClick={() => setSuggestionDismissed(true)} className="rounded-pill border border-primary/30 bg-white px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-light">Not today</button></div></div>}

          <div className="rounded-card border border-border bg-white"><button type="button" onClick={() => setSetupOpen((open) => !open)} aria-expanded={setupOpen} className="flex w-full items-center justify-between p-5 text-left"><span><span className="block text-xs font-medium uppercase tracking-wide text-ink-light">Set up your day</span><span className="mt-1 block text-xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{calendar?.connected ? "Choose support that fits what is ahead." : "A little preparation can lower the pressure."}</span></span><span aria-hidden="true" className="text-xl text-primary">{setupOpen ? "−" : "+"}</span></button>{setupOpen && <div className="grid border-t border-border sm:grid-cols-3">{nextMeetingToPrep ? <Link href={prepHref(nextMeetingToPrep)} className="border-b border-border p-4 text-sm font-medium text-ink transition-colors hover:bg-primary-light/40 sm:border-b-0 sm:border-r"><span className="block text-primary">Prepare for {nextMeetingToPrep.title}</span><span className="mt-1 block text-xs font-normal text-ink-mid">Meeting with {attendeeNames(nextMeetingToPrep).slice(0, 2).join(", ")}.</span></Link> : <Link href="/dashboard/skills" className="border-b border-border p-4 text-sm font-medium text-ink transition-colors hover:bg-primary-light/40 sm:border-b-0 sm:border-r"><span className="block text-primary">Choose a focus</span><span className="mt-1 block text-xs font-normal text-ink-mid">Use your available time for one useful skill.</span></Link>}<Link href="/dashboard/workday" className="border-b border-border p-4 text-sm font-medium text-ink transition-colors hover:bg-primary-light/40 sm:border-b-0 sm:border-r"><span className="block text-primary">{suggestion.kind === "break" ? "Plan a reset" : "Check in with yourself"}</span><span className="mt-1 block text-xs font-normal text-ink-mid">{suggestion.kind === "break" ? "Make room around the busiest part of your day." : "Choose support for how you are feeling now."}</span></Link><Link href="/dashboard/calendar" className="p-4 text-sm font-medium text-ink transition-colors hover:bg-primary-light/40"><span className="block text-primary">View your week</span><span className="mt-1 block text-xs font-normal text-ink-mid">See the meetings and open space Beckett is using.</span></Link></div>}</div>
        </div>
      </div>
    </section>
  );
}
