"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const steps = [
  "Name",
  "Extension",
];

const chromeExtensionUrl = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL;

export default function ProfileSetupForm() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      setEmail(user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile?.first_login_complete) {
        router.replace("/dashboard");
        return;
      }

      const fullName = profile?.full_name || user.user_metadata?.full_name || "";
      const [first = "", ...rest] = fullName.split(" ").filter(Boolean);
      setFirstName(profile?.first_name || first);
      setLastName(profile?.last_name || rest.join(" "));
      setDisplayName(profile?.display_name || profile?.first_name || first);
      setLoading(false);
    }

    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = useMemo(() => {
    if (step === 0) return firstName.trim() && lastName.trim() && displayName.trim();
    return true;
  }, [displayName, firstName, lastName, step]);

  async function finish() {
    setSaving(true);
    setError("");
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const payload = {
      email,
      full_name: fullName,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      display_name: displayName.trim(),
    };

    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || "Could not save onboarding. Please try again.");
      setSaving(false);
      return;
    }

    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        display_name: displayName.trim(),
        first_login_complete: true,
      },
    });

    router.push("/dashboard");
    router.refresh();
  }

  function next() {
    if (!canContinue) return;
    if (step === steps.length - 1) finish();
    else setStep((current) => current + 1);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-primary mb-2">
            Beta access
          </p>
          <h1
            className="text-3xl text-ink mb-2"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Set up your Beckett coach
          </h1>
          <p className="text-sm text-ink-mid">
            Start with your name, then connect the extension. You can add communication preferences in About Me.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {steps.map((label, index) => (
            <div key={label} className="min-w-0">
              <div
                className={`h-1 rounded-pill mb-2 ${
                  index <= step ? "bg-primary" : "bg-border"
                }`}
              />
              <p className="truncate text-[11px] text-ink-light">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-card border border-border p-6 shadow-sm">
          {step === 0 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">What should Beckett call you?</h2>
              <p className="text-sm text-ink-mid mb-5">
                This is used inside the dashboard and for coaching prompts.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">First name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Last name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1">Display name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">Next: connect the extension</h2>
              <p className="text-sm text-ink-mid mb-5">
                The Beckett extension is where Gmail and Slack coaching happens. Install it now, or continue and connect it from your dashboard.
              </p>
              <div className="rounded-sm border border-primary/20 bg-primary-light p-4">
                <p className="text-sm font-medium text-ink">Your beta access includes:</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-mid">
                  <li>Gmail and Slack message analysis</li>
                  <li>Drafting help from Beckett</li>
                  <li>Professional mode by default, with Personal available when you need it</li>
                  <li>Interactive workplace courses</li>
                </ul>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {chromeExtensionUrl ? (
                  <a
                    href={chromeExtensionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-pill bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                  >
                    Open Chrome Web Store
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-pill bg-ink-light/20 px-5 py-2.5 text-sm font-medium text-ink-mid"
                  >
                    Chrome Web Store link coming soon
                  </button>
                )}
                <a
                  href="/dashboard/settings"
                  className="inline-flex items-center justify-center rounded-pill border border-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary-mid"
                >
                  Connect later
                </a>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-5">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
              className="text-sm border border-border rounded-pill px-5 py-2 text-ink disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canContinue || saving}
              className="bg-primary text-white text-sm rounded-pill px-6 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : step === steps.length - 1 ? "Go to dashboard" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
