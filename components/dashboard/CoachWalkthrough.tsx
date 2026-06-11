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
    title: "Start from your dashboard.",
    body:
      "This is where you can check in, see your progress, find recommended skills, and finish any setup steps.",
  },
  {
    eyebrow: "Practice",
    title: "Rehearse before a real conversation.",
    body:
      "Use Practice when you have something coming up with a manager, teammate, client, or colleague and want to try the words first.",
  },
  {
    eyebrow: "Skills",
    title: "Build repeatable communication tools.",
    body:
      "Skills are guided coaching modules for common workplace moments, like asking for clarity, saying no, or working with a new colleague.",
  },
  {
    eyebrow: "Connections",
    title: "Bring Beckett into your work tools.",
    body:
      "When you are ready, connect Gmail, Slack, and the Chrome extension so Beckett can help where your work conversations already happen.",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8">
      <div className="w-full max-w-lg rounded-card border border-border bg-white p-6 shadow-xl">
        <div className="mb-5">
          <div className="mb-3 h-1.5 overflow-hidden rounded-pill bg-bg">
            <div className="h-full rounded-pill bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{current.eyebrow}</p>
          <h2 className="mt-2 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-mid">{current.body}</p>
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
              Finish setup
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
