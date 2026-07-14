"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BetaMissionKey, BetaMissionsResponse } from "@/lib/beta-missions";

type MissionAction = "complete" | "skip" | "feedback";

export default function BetaMissionsCard() {
  const [data, setData] = useState<BetaMissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<BetaMissionKey | null>(null);
  const [skipKey, setSkipKey] = useState<BetaMissionKey | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [feedbackKey, setFeedbackKey] = useState<BetaMissionKey | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<"helpful" | "not_helpful" | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/beta-missions", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load your beta missions.");
        if (active) setData(body);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your beta missions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function updateMission(
    missionKey: BetaMissionKey,
    action: MissionAction,
    extra: Record<string, string | null> = {}
  ) {
    setBusyKey(missionKey);
    setError(null);
    try {
      const response = await fetch("/api/beta-missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionKey, action, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update this mission.");
      setData(body);
      if (action === "complete") {
        setFeedbackKey(missionKey);
        setFeedbackRating(null);
        setFeedbackComment("");
      }
      if (action === "skip") {
        setSkipKey(null);
        setSkipReason("");
      }
      if (action === "feedback") {
        setFeedbackKey(null);
        setFeedbackRating(null);
        setFeedbackComment("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update this mission.");
    } finally {
      setBusyKey(null);
    }
  }

  const feedbackMission = data?.missions.find((mission) => mission.key === feedbackKey) || null;
  const progress = data?.totalCount ? Math.round((data.completedCount / data.totalCount) * 100) : 0;

  return (
    <section data-tour="beta-setup" className="mb-6 rounded-card border border-primary/20 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Beta missions</p>
          <h2 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
            Help shape Beckett as you use it
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-mid">
            Try these three next. Other testers may see a different order so we learn across the whole experience.
          </p>
        </div>
        {data ? (
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium text-ink">{data.completedCount}/{data.totalCount} complete</p>
            <p className="text-xs text-ink-light">{progress}% of your missions</p>
          </div>
        ) : null}
      </div>

      {data ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg" aria-label={`${progress}% of beta missions complete`}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-card bg-bg" />)}
        </div>
      ) : null}

      {!loading && error ? (
        <p className="mt-5 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {!loading && data?.visibleMissions.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {data.visibleMissions.map((mission) => (
            <article key={mission.key} className="flex min-h-48 flex-col rounded-card border border-border bg-bg/40 p-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => updateMission(mission.key, "complete")}
                  disabled={busyKey === mission.key}
                  aria-label={`Mark ${mission.title} complete`}
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-white text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
                >
                  {busyKey === mission.key ? "…" : ""}
                </button>
                <div>
                  <span className="rounded-pill bg-primary-light px-2.5 py-1 text-[11px] font-medium text-primary">
                    {mission.category}
                  </span>
                  <h3 className="mt-2 text-sm font-medium text-ink">{mission.title}</h3>
                </div>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-ink-mid">{mission.description}</p>

              {skipKey === mission.key ? (
                <div className="mt-3 rounded-sm border border-border bg-white p-3">
                  <label className="text-xs font-medium text-ink" htmlFor={`skip-${mission.key}`}>Why are you skipping? Optional</label>
                  <input
                    id={`skip-${mission.key}`}
                    value={skipReason}
                    onChange={(event) => setSkipReason(event.target.value)}
                    placeholder="Not relevant, blocked, or something else"
                    className="mt-2 w-full rounded-sm border border-border px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateMission(mission.key, "skip", { skipReason })}
                      disabled={busyKey === mission.key}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      Skip mission
                    </button>
                    <button type="button" onClick={() => setSkipKey(null)} className="text-xs text-ink-light hover:underline">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link
                    href={mission.href}
                    target={mission.external ? "_blank" : undefined}
                    rel={mission.external ? "noreferrer" : undefined}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {mission.actionLabel} →
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setSkipKey(mission.key); setSkipReason(""); }}
                    className="text-xs text-ink-light hover:text-ink"
                  >
                    Skip
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {!loading && data && data.visibleMissions.length === 0 ? (
        <div className="mt-5 rounded-card border border-green-200 bg-green-50 p-5">
          <p className="font-medium text-green-800">You completed this round of beta missions.</p>
          <p className="mt-1 text-sm text-green-700">Thank you—your testing gives us a much clearer picture of what to improve.</p>
        </div>
      ) : null}

      {feedbackMission ? (
        <div className="mt-4 rounded-card border border-primary/20 bg-primary-light/40 p-4">
          <p className="text-sm font-medium text-ink">How did “{feedbackMission.title}” go?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["helpful", "not_helpful"] as const).map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => setFeedbackRating(rating)}
                className={`rounded-pill border px-3 py-1.5 text-xs font-medium ${
                  feedbackRating === rating ? "border-primary bg-primary text-white" : "border-border bg-white text-ink-mid"
                }`}
              >
                {rating === "helpful" ? "Helpful" : "Needs work"}
              </button>
            ))}
          </div>
          <textarea
            value={feedbackComment}
            onChange={(event) => setFeedbackComment(event.target.value)}
            placeholder="What worked or felt off? Optional"
            rows={2}
            className="mt-3 w-full rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={!feedbackRating || busyKey === feedbackMission.key}
              onClick={() => updateMission(feedbackMission.key, "feedback", { rating: feedbackRating, comment: feedbackComment })}
              className="rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Send feedback
            </button>
            <button type="button" onClick={() => setFeedbackKey(null)} className="text-xs text-ink-light hover:underline">Not now</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
