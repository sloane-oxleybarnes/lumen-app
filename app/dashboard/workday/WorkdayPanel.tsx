"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  timeOfDayForDate,
  type PatternSummary,
  type WorkdayCheckin,
} from "@/lib/workday-patterns";
import SupportPlansPanel from "./SupportPlansPanel";

type Response = { checkins: Array<WorkdayCheckin & { id: string; checked_in_at: string }>; summaries: PatternSummary[]; error?: string };

const fieldOptions = {
  time_of_day: [["morning", "Morning"], ["midday", "Midday"], ["afternoon", "Afternoon"], ["evening", "Evening"]],
  workload_level: [["light", "Light"], ["steady", "Steady"], ["stacked", "Stacked"]],
  break_status: [["taken", "I took a break"], ["not_taken", "Not yet"], ["would_help", "A break would help"]],
  helpful_strategy: [["quiet_block", "A quieter block"], ["written_next_steps", "Written next steps"], ["clearer_priority", "A clearer priority"], ["short_break", "A short break"], ["draft_before_sending", "Draft before sending"], ["none_yet", "No strategy yet"]],
} as const;

const initialCheckin: WorkdayCheckin = { time_of_day: "morning", workload_level: "steady", energy_level: 3, communication_friction: false, break_status: "not_taken", helpful_strategy: "none_yet" };

export default function WorkdayPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [checkin, setCheckin] = useState<WorkdayCheckin>(() => ({ ...initialCheckin, time_of_day: timeOfDayForDate() }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakIdeasOpen, setBreakIdeasOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workday/checkins", { cache: "no-store" });
      const payload = await response.json() as Response;
      if (!response.ok) throw new Error(payload.error || "Could not load workday coaching.");
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load workday coaching.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveCheckin(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const response = await fetch("/api/workday/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checkin) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your check-in.");
      await load(); setBreakIdeasOpen(checkin.workload_level === "stacked" || checkin.break_status === "would_help");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save your check-in."); }
    finally { setSaving(false); }
  }

  const latest = data?.checkins[0];
  const offerBreak = latest && (latest.workload_level === "stacked" || latest.break_status === "would_help");
  return <div className="max-w-3xl">
    <h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Workday</h1>
    <p className="mb-8 text-sm text-ink-mid">A private place to notice what is helping, one check-in at a time.</p>
    <div className="mb-5 rounded-sm border border-primary/15 bg-primary-light/40 p-4 text-sm leading-relaxed text-ink-mid">Beckett does not monitor your calendar, messages, or activity here. Check-ins are voluntary and structured; pattern summaries appear only when you enabled them in Settings.</div>
    {error && <div className="mb-5 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <form onSubmit={saveCheckin} className="mb-6 rounded-card border border-border bg-white p-6">
      <h2 className="mb-1 text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>A quick check-in</h2>
      <p className="mb-5 text-xs text-ink-mid">This takes about a minute. There is no free-text work history to fill out.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice label="Time of day" value={checkin.time_of_day} options={fieldOptions.time_of_day} onChange={(value) => setCheckin({ ...checkin, time_of_day: value as WorkdayCheckin["time_of_day"] })} />
        <Choice label="Workload" value={checkin.workload_level} options={fieldOptions.workload_level} onChange={(value) => setCheckin({ ...checkin, workload_level: value as WorkdayCheckin["workload_level"] })} />
        <Choice label="Break" value={checkin.break_status} options={fieldOptions.break_status} onChange={(value) => setCheckin({ ...checkin, break_status: value as WorkdayCheckin["break_status"] })} />
        <Choice label="What might help?" value={checkin.helpful_strategy} options={fieldOptions.helpful_strategy} onChange={(value) => setCheckin({ ...checkin, helpful_strategy: value as WorkdayCheckin["helpful_strategy"] })} />
      </div>
      <fieldset className="mt-5"><legend className="mb-2 text-sm font-medium text-ink">Energy</legend><div className="flex gap-2">{[1,2,3,4,5].map((level) => <button type="button" key={level} onClick={() => setCheckin({ ...checkin, energy_level: level })} className={`h-9 w-9 rounded-full border text-sm ${checkin.energy_level === level ? "border-primary bg-primary text-white" : "border-border text-ink-mid"}`} aria-label={`${level} out of 5`}>{level}</button>)}</div></fieldset>
      <label className="mt-5 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={checkin.communication_friction} onChange={(event) => setCheckin({ ...checkin, communication_friction: event.target.checked })} className="h-4 w-4 accent-primary" /> Communication felt harder than usual</label>
      <button type="submit" disabled={saving} className="mt-6 rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{saving ? "Saving…" : "Save check-in"}</button>
    </form>
    {offerBreak && <section className="mb-6 rounded-card border border-amber-200 bg-amber-50 p-5"><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Your day is stacked. Do you want help finding a break?</h2><p className="mt-1 text-sm text-ink-mid">This is a quiet suggestion here in Beckett—nothing will be scheduled or sent.</p><button type="button" onClick={() => setBreakIdeasOpen(!breakIdeasOpen)} className="mt-3 text-sm font-medium text-primary hover:underline">{breakIdeasOpen ? "Hide ideas" : "Help me find 10 minutes"}</button>{breakIdeasOpen && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-mid"><li>Protect the first 10-minute gap between two commitments.</li><li>Turn one non-urgent reply into a draft for later.</li><li>Ask for a clearer next priority before taking on another task.</li></ul>}</section>}
    <section className="rounded-card border border-border bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Patterns you asked Beckett to summarize</h2><p className="mt-1 text-xs text-ink-mid">Each statement is based only on your voluntary check-ins from the last 14 days.</p></div><Link href="/dashboard/settings" className="text-xs font-medium text-primary hover:underline">Pattern settings</Link></div>{loading ? <p className="mt-5 text-sm text-ink-mid">Loading your check-ins…</p> : data?.summaries.length ? <div className="mt-5 space-y-3">{data.summaries.map((summary, index) => <article key={`${summary.category}-${index}`} className="rounded-sm border border-border bg-bg/50 p-4"><p className="text-sm text-ink">{summary.summary}</p><p className="mt-2 text-xs text-ink-light">Based on {summary.evidence.matchingCheckins} of {summary.evidence.totalCheckins} check-ins in the last {summary.evidence.periodDays} days.</p></article>)}</div> : <p className="mt-5 text-sm leading-relaxed text-ink-mid">No pattern summaries yet. Save at least three check-ins and turn on “Allow future pattern summaries” in Settings if you want Beckett to create them.</p>}</section>
    <SupportPlansPanel />
    <section className="mt-6 rounded-card border border-border bg-white p-6"><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Workplace supports</h2><p className="mt-1 text-sm leading-relaxed text-ink-mid">Prepare a clear, user-controlled request for a workplace support or accommodation. Beckett does not provide legal advice.</p><Link href="/dashboard/accommodations" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Open the request builder →</Link></section>
  </div>;
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly string[])[]; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-sm border border-border bg-white px-3 py-2 text-sm font-normal text-ink">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
