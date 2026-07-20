"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import CreditTracker from "@/components/dashboard/CreditTracker";

type Rating = "yes" | "no";

export default function BetaFeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function submitFeedback(selectedRating = rating) {
    if (!selectedRating || status === "saving") return;

    setStatus("saving");
    setError("");

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: selectedRating,
        comment,
        page: pathname,
        source: "dashboard",
        metadata: {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setStatus("error");
      setError(data.error || "Could not save feedback.");
      return;
    }

    setStatus("saved");
    setComment("");
    window.setTimeout(() => {
      setOpen(false);
      setRating(null);
      setStatus("idle");
    }, 1200);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
      <CreditTracker />
      {open && (
        <div className="w-[min(calc(100vw-2rem),360px)] rounded-card border border-border bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Beta feedback</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                Tell us what worked or what got confusing on this page. Your note is saved for beta
                review and may include what you type here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-lg leading-none text-ink-light hover:text-ink"
              aria-label="Close feedback form"
            >
              ×
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              { value: "yes" as const, label: "Worked well" },
              { value: "no" as const, label: "Needs work" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRating(option.value)}
                className={`rounded-pill border px-3 py-2 text-xs font-medium transition-colors ${
                  rating === option.value
                    ? "border-primary bg-primary-light text-primary"
                    : "border-border text-ink-mid hover:border-primary hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What should we know?"
            rows={4}
            className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <p className="mt-3 rounded-sm bg-bg px-3 py-2 text-xs leading-relaxed text-ink-mid">
            Need help or need to report a privacy or security concern? Email{" "}
            <a className="font-medium text-primary hover:underline" href="mailto:hello@meetbeckett.co">
              hello@meetbeckett.co
            </a>
            . We acknowledge normal beta support requests within one business day. Active or
            suspected security incidents are reviewed as soon as they are discovered.
          </p>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {status === "saved" && <p className="mt-2 text-xs text-primary">Thanks. This is saved for review.</p>}

          <button
            type="button"
            onClick={() => submitFeedback()}
            disabled={!rating || status === "saving"}
            className="mt-3 w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {status === "saving" ? "Saving..." : "Send feedback"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-pill border border-primary bg-white px-4 py-2 text-sm font-medium text-primary shadow-lg transition-colors hover:bg-primary-light"
      >
        Feedback
      </button>
    </div>
  );
}
