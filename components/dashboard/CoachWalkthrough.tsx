"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const walkthroughSteps = [
  {
    eyebrow: "Welcome",
    title: "Hi, I am Beckett.",
    body:
      "I am your workplace communication coach. I can help you practice, decode, and draft conversations when work communication gets complicated.",
  },
  {
    eyebrow: "Coach hub",
    title: "Start from the coach hub.",
    body:
      "When you are not sure what to do next, use the Start here card. Practice is for real conversations; Skills are for building a repeatable tool.",
  },
  {
    eyebrow: "Setup",
    title: "Connect the tools Beckett can coach in.",
    body:
      "The setup checklist shows Chrome extension, Gmail, and Slack status. You can finish or reconnect them from Settings whenever you need.",
  },
  {
    eyebrow: "Practice",
    title: "Rehearse before the real thing.",
    body:
      "Use Practice when something specific is coming up with a manager, teammate, client, or colleague and you want to try the words first.",
  },
  {
    eyebrow: "Skills",
    title: "Build repeatable communication tools.",
    body:
      "Skills are short coaching modules for common workplace moments, like working with a new colleague, saying no, or asking for clarity.",
  },
  {
    eyebrow: "Profile",
    title: "You stay in control.",
    body:
      "Your About Me and Settings help Beckett coach you in a way that fits you. You can edit your preferences or remove context later.",
  },
];

type CoachWalkthroughProps = {
  shouldShow: boolean;
};

export default function CoachWalkthrough({ shouldShow }: CoachWalkthroughProps) {
  const [open, setOpen] = useState(shouldShow);
  const [step, setStep] = useState(0);
  const current = walkthroughSteps[step];
  const isLast = step === walkthroughSteps.length - 1;

  const progress = useMemo(
    () => Math.round(((step + 1) / walkthroughSteps.length) * 100),
    [step]
  );

  async function finish() {
    setOpen(false);
    await fetch("/api/onboarding/walkthrough", { method: "POST" }).catch(() => {});
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-walkthrough-title"
      aria-describedby="coach-walkthrough-body"
    >
      <div className="w-full max-w-lg rounded-card border border-border bg-white p-6 shadow-xl">
        <div className="mb-5">
          <div
            className="mb-3 h-1.5 overflow-hidden rounded-pill bg-bg"
            role="progressbar"
            aria-label="Walkthrough progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-pill bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{current.eyebrow}</p>
          <h2
            id="coach-walkthrough-title"
            className="mt-2 text-2xl text-ink"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            {current.title}
          </h2>
          <p id="coach-walkthrough-body" className="mt-3 text-sm leading-relaxed text-ink-mid">
            {current.body}
          </p>
        </div>

        {isLast ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <Link
              href="/dashboard/practice"
              onClick={() => finish()}
              className="rounded-pill bg-primary px-4 py-2 text-center text-xs font-medium text-white hover:bg-primary-dark"
            >
              Start practice
            </Link>
            <Link
              href="/dashboard/skills"
              onClick={() => finish()}
              className="rounded-pill border border-border px-4 py-2 text-center text-xs font-medium text-ink hover:bg-bg"
            >
              Explore skills
            </Link>
            <button
              type="button"
              onClick={finish}
              className="rounded-pill border border-border px-4 py-2 text-xs font-medium text-ink hover:bg-bg"
            >
              Go to dashboard
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={finish}
              className="text-sm text-ink-mid hover:text-ink"
            >
              Skip for now
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
                disabled={step === 0}
                className="rounded-pill border border-border px-4 py-2 text-sm text-ink disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep((currentStep) => currentStep + 1)}
                className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
