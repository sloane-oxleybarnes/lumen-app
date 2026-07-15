"use client";

import { useEffect, useState } from "react";

type Limit = { limit: number; used: number; remaining: number; resetsAt: string };
type Summary = {
  enabled: boolean;
  unlimited?: boolean;
  daily?: Limit;
  monthly?: Limit;
  courses?: Limit | null;
};

function resetLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function CreditTracker() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/credits", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary?.enabled || !summary.daily || !summary.monthly) return null;
  const low = summary.daily.remaining <= Math.max(2, Math.floor(summary.daily.limit * 0.2));

  return (
    <div className="flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(calc(100vw-2rem),300px)] rounded-card border border-border bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Coaching credits</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close credit details" className="text-ink-light hover:text-ink">×</button>
          </div>
          {summary.unlimited ? (
            <p className="text-sm text-primary">Internal testing account · unlimited</p>
          ) : (
            <div className="space-y-3 text-sm">
              <LimitRow label="Today" value={summary.daily} />
              <LimitRow label="This month" value={summary.monthly} />
              {summary.courses && <LimitRow label="Courses this month" value={summary.courses} />}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-light">Only successful coaching responses use a credit. Course activities do not.</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`rounded-pill border bg-white px-4 py-2 text-sm font-medium shadow-lg transition-colors ${low ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-primary text-primary hover:bg-primary-light"}`}
      >
        {summary.unlimited ? "Credits · Unlimited" : `${summary.daily.remaining} credits today`}
      </button>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: Limit }) {
  return (
    <div>
      <div className="flex justify-between gap-3"><span className="text-ink-mid">{label}</span><span className="font-medium text-ink">{value.remaining} of {value.limit} left</span></div>
      <p className="mt-0.5 text-right text-xs text-ink-light">Resets {resetLabel(value.resetsAt)}</p>
    </div>
  );
}
