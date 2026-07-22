"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkdayCheckin } from "@/lib/workday-patterns";

const initialCheckin: WorkdayCheckin = {
  time_of_day: "morning",
  workload_level: "steady",
  energy_level: 3,
  communication_friction: false,
  break_status: "not_taken",
  helpful_strategy: "none_yet",
};

const options = {
  time_of_day: [["morning", "Morning"], ["midday", "Midday"], ["afternoon", "Afternoon"], ["evening", "Evening"]],
  workload_level: [["light", "Light"], ["steady", "Steady"], ["stacked", "Stacked"]],
  break_status: [["taken", "I took a break"], ["not_taken", "Not yet"], ["would_help", "A break would help"]],
  helpful_strategy: [["quiet_block", "A quieter block"], ["written_next_steps", "Written next steps"], ["clearer_priority", "A clearer priority"], ["short_break", "A short break"], ["draft_before_sending", "Draft before sending"], ["none_yet", "No strategy yet"]],
} as const;

export default function WorkdayCheckinCard() {
  const [checkin, setCheckin] = useState<WorkdayCheckin>(initialCheckin);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch("/api/workday/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checkin) });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not save your check-in.");
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your check-in.");
    } finally { setSaving(false); }
  }

  return <section className="mb-6 rounded-card border border-border bg-white p-6">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Workday</p><h2 className="mt-1 text-xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Workday check-in</h2><p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-mid">A private, voluntary snapshot of what would help today. Beckett never monitors your work activity or fills this in for you.</p><p className="mt-2 max-w-xl text-xs leading-relaxed text-ink-light">Your choices are only used to show your own optional 14-day pattern summaries and support plans. They are never sent to your employer or used to make decisions about you.</p></div>
      {saved && <p className="text-sm font-medium text-primary">Saved</p>}
    </div>
    <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
      <Select label="Time of day" value={checkin.time_of_day} options={options.time_of_day} onChange={(value) => setCheckin({ ...checkin, time_of_day: value as WorkdayCheckin["time_of_day"] })} />
      <Select label="Workload" value={checkin.workload_level} options={options.workload_level} onChange={(value) => setCheckin({ ...checkin, workload_level: value as WorkdayCheckin["workload_level"] })} />
      <Select label="Break" value={checkin.break_status} options={options.break_status} onChange={(value) => setCheckin({ ...checkin, break_status: value as WorkdayCheckin["break_status"] })} />
      <Select label="What might help?" value={checkin.helpful_strategy} options={options.helpful_strategy} onChange={(value) => setCheckin({ ...checkin, helpful_strategy: value as WorkdayCheckin["helpful_strategy"] })} />
      <fieldset><legend className="mb-2 text-sm font-medium text-ink">Energy</legend><div className="flex gap-2">{[1, 2, 3, 4, 5].map((level) => <button key={level} type="button" onClick={() => setCheckin({ ...checkin, energy_level: level })} aria-pressed={checkin.energy_level === level} className={`h-9 w-9 rounded-full border text-sm ${checkin.energy_level === level ? "border-primary bg-primary text-white" : "border-border text-ink-mid hover:border-primary"}`}>{level}</button>)}</div></fieldset>
      <label className="flex items-end gap-2 pb-1 text-sm text-ink"><input type="checkbox" checked={checkin.communication_friction} onChange={(event) => setCheckin({ ...checkin, communication_friction: event.target.checked })} className="h-4 w-4 accent-primary" />Communication felt harder than usual</label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button disabled={saving} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{saving ? "Saving…" : "Save check-in"}</button><Link href="/dashboard/settings#workday-reminders" className="text-sm font-medium text-primary hover:underline">Set up reminders to check in</Link><Link href="/dashboard/workday" className="text-sm font-medium text-primary hover:underline">View patterns and support plans</Link>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}</div>
    </form>
  </section>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly string[])[]; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-sm border border-border bg-white px-3 py-2 text-sm font-normal text-ink">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
