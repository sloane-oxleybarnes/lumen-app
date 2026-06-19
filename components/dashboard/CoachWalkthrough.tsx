"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WalkthroughPreview = "dashboard" | "practice" | "skills" | "setup" | "about" | "settings";

type WalkthroughStep = {
  eyebrow: string;
  title: string;
  body: string;
  target?: string;
  targetLabel?: string;
  preview: WalkthroughPreview;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const walkthroughSteps: WalkthroughStep[] = [
  {
    eyebrow: "Welcome",
    title: "Hi, I am Beckett.",
    body:
      "I am your workplace communication coach. This dashboard is the home base for practice, skills, tool connections, and your coaching profile.",
    preview: "dashboard",
  },
  {
    eyebrow: "Start here",
    title: "Use Start here when you are not sure what to do next.",
    body:
      "If you have a real conversation coming up, start with Practice. If nothing is urgent, pick a Skill and build a repeatable tool.",
    target: '[data-tour="start-practice"]',
    targetLabel: "Click Practice a conversation",
    preview: "dashboard",
  },
  {
    eyebrow: "Practice",
    title: "Practice opens a guided setup.",
    body:
      "Beckett asks who you are talking to, how you know them, their style, and what conversation you want to practice before the roleplay starts.",
    target: '[data-tour="nav-practice"]',
    targetLabel: "Practice also lives in the sidebar",
    preview: "practice",
  },
  {
    eyebrow: "Skills",
    title: "Skills are coached workshops.",
    body:
      "Skills are for common patterns, like introducing yourself to a new colleague or asking for clarity at work. You can save progress and come back later.",
    target: '[data-tour="start-skills"]',
    targetLabel: "Click Pick a skill",
    preview: "skills",
  },
  {
    eyebrow: "Connections",
    title: "Connect the tools Beckett can coach in.",
    body:
      "The setup checklist shows Chrome extension, Gmail, and Slack status. Settings is where you can reconnect anything later.",
    target: '[data-tour="beta-setup"]',
    targetLabel: "Check setup status here",
    preview: "setup",
  },
  {
    eyebrow: "About Me",
    title: "Your coaching profile shapes the support.",
    body:
      "About Me stores strengths, triggers, communication preferences, neurodivergent context, and your communication toolkit. You can edit or delete items.",
    target: '[data-tour="nav-about-me"]',
    targetLabel: "Open About Me from the sidebar",
    preview: "about",
  },
  {
    eyebrow: "Settings",
    title: "You stay in control.",
    body:
      "Settings is where account details, connected tools, beta diagnostics, and deletion requests live. Nothing here is locked away from you.",
    target: '[data-tour="nav-settings"]',
    targetLabel: "Settings is always in the sidebar",
    preview: "settings",
  },
];

type CoachWalkthroughProps = {
  shouldShow: boolean;
};

export default function CoachWalkthrough({ shouldShow }: CoachWalkthroughProps) {
  const [open, setOpen] = useState(shouldShow);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const current = walkthroughSteps[step];
  const isLast = step === walkthroughSteps.length - 1;

  const progress = useMemo(
    () => Math.round(((step + 1) / walkthroughSteps.length) * 100),
    [step]
  );

  useEffect(() => {
    if (!open || !current.target) {
      setTargetRect(null);
      return;
    }

    function updateTarget() {
      const element = document.querySelector(current.target || "");
      if (!element) {
        setTargetRect(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }

    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [current.target, open]);

  async function finish() {
    setOpen(false);
    await fetch("/api/onboarding/walkthrough", { method: "POST" }).catch(() => {});
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-ink/35 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-walkthrough-title"
      aria-describedby="coach-walkthrough-body"
    >
      {targetRect && (
        <>
          <div
            className="pointer-events-none fixed z-[81] rounded-card border-2 border-primary bg-white/10 shadow-[0_0_0_9999px_rgba(36,32,29,0.28)] transition-all"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
            }}
          />
          {current.targetLabel && (
            <div
              className="pointer-events-none fixed z-[82] hidden rounded-pill bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-lg md:block"
              style={{
                top: Math.max(16, targetRect.top - 44),
                left: Math.min(window.innerWidth - 220, Math.max(16, targetRect.left)),
              }}
            >
              {current.targetLabel}
            </div>
          )}
        </>
      )}

      <div className="relative z-[83] mx-auto flex h-full w-full max-w-5xl items-center justify-center">
        <div className="grid max-h-full w-full overflow-hidden rounded-card border border-border bg-white shadow-xl lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col p-5 sm:p-6">
            <div
              className="mb-4 h-1.5 overflow-hidden rounded-pill bg-bg"
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

            {current.targetLabel && (
              <div className="mt-5 rounded-card border border-primary/20 bg-primary-light/40 p-3 lg:hidden">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Where to click</p>
                <p className="mt-1 text-sm text-ink">{current.targetLabel}</p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 lg:mt-auto">
              <button type="button" onClick={finish} className="text-sm text-ink-mid hover:text-ink">
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
                {isLast ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    Finish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep((currentStep) => currentStep + 1)}
                    className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-bg p-4 sm:p-5 lg:border-l lg:border-t-0">
            <WalkthroughPreview type={current.preview} />
            {isLast && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                  className="rounded-pill border border-border bg-white px-4 py-2 text-center text-xs font-medium text-ink hover:bg-primary-light"
                >
                  Explore skills
                </Link>
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-pill border border-border bg-white px-4 py-2 text-xs font-medium text-ink hover:bg-primary-light"
                >
                  Stay here
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WalkthroughPreview({ type }: { type: WalkthroughPreview }) {
  if (type === "practice") return <PracticePreview />;
  if (type === "skills") return <SkillsPreview />;
  if (type === "setup") return <SetupPreview />;
  if (type === "about") return <AboutPreview />;
  if (type === "settings") return <SettingsPreview />;
  return <DashboardPreview />;
}

function PreviewShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-primary/40" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-ink-light/30" />
        </div>
      </div>
      <div className="min-h-[300px] p-4">{children}</div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <PreviewShell label="Dashboard overview">
      <div className="space-y-4">
        <div className="rounded-card border border-border bg-bg/60 p-4">
          <p className="text-xs uppercase tracking-wide text-ink-light">Where I am at today</p>
          <p className="mt-2 text-lg text-ink">Quick check-in</p>
          <div className="mt-3 flex gap-2">
            {["Low", "Okay", "Focused"].map((item) => (
              <span key={item} className="rounded-pill border border-border bg-white px-3 py-1 text-xs text-ink-mid">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-card border border-primary/20 bg-primary-light/40 p-4">
          <p className="text-xs uppercase tracking-wide text-primary">Start here</p>
          <p className="mt-2 text-lg text-ink">What should I do next?</p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-pill bg-primary px-3 py-1.5 text-xs text-white">Practice</span>
            <span className="rounded-pill border border-primary/30 bg-white px-3 py-1.5 text-xs text-primary">Skills</span>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function PracticePreview() {
  return (
    <PreviewShell label="Practice page">
      <div className="space-y-4">
        <div>
          <p className="text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
            Practice a conversation
          </p>
          <p className="mt-1 text-sm text-ink-mid">Beckett helps you set up the scene before the roleplay starts.</p>
        </div>
        <div className="rounded-card border border-border bg-bg p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">About Them</p>
          <div className="mt-3 grid gap-2">
            {["Who are you talking to?", "How do you know them?", "Their collaboration style"].map((item) => (
              <div key={item} className="rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink-mid">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-card border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">The Conversation</p>
          <p className="mt-2 text-sm text-ink-mid">Goal, pressure level, and what you want to practice.</p>
        </div>
      </div>
    </PreviewShell>
  );
}

function SkillsPreview() {
  return (
    <PreviewShell label="Skills and courses">
      <div className="space-y-3">
        <div>
          <p className="text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
            Skills and courses
          </p>
          <p className="mt-1 text-sm text-ink-mid">Coached workshops for repeatable communication patterns.</p>
        </div>
        {[
          ["Introducing yourself to a new colleague", "Foundational"],
          ["Asking for Clarity at Work", "Foundational"],
          ["Asking someone out on a dating app", "Personal"],
        ].map(([title, badge]) => (
          <div key={title} className="rounded-card border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">{title}</p>
              <span className="rounded-pill bg-primary-light px-2 py-0.5 text-xs text-primary">{badge}</span>
            </div>
            <p className="mt-2 text-xs text-ink-light">Save progress and return later.</p>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

function SetupPreview() {
  return (
    <PreviewShell label="Beta setup">
      <div className="space-y-3">
        {[
          ["Chrome extension", "Use Beckett inside Gmail and Slack."],
          ["Gmail", "Read full email threads when you ask."],
          ["Slack", "Use Slack context in DMs, channels, and threads."],
        ].map(([title, body]) => (
          <div key={title} className="flex items-start gap-3 rounded-card border border-border bg-white p-4">
            <span className="mt-0.5 h-5 w-5 rounded-full border border-primary bg-primary-light" />
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="mt-1 text-xs text-ink-mid">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

function AboutPreview() {
  return (
    <PreviewShell label="About Me">
      <div className="space-y-3">
        {["Communication strengths", "Workplace triggers", "Communication preferences", "Communication toolkit"].map((title) => (
          <div key={title} className="rounded-card border border-border bg-white p-4">
            <p className="text-sm font-medium text-ink">{title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-pill bg-bg px-2 py-1 text-xs text-ink-mid">Selected item</span>
              <span className="rounded-pill bg-bg px-2 py-1 text-xs text-ink-mid">Edit</span>
            </div>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

function SettingsPreview() {
  return (
    <PreviewShell label="Settings">
      <div className="space-y-3">
        {["Connected accounts", "Extension status", "Beta diagnostics", "Delete my information"].map((title) => (
          <div key={title} className="rounded-card border border-border bg-white p-4">
            <p className="text-sm font-medium text-ink">{title}</p>
            <p className="mt-1 text-xs text-ink-mid">Manage this from Settings.</p>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}
