"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  coachingToneOptions,
  communicationPreferenceOptions,
  neurodivergentContextOptions,
  strengthOptions,
  workplaceTriggerOptions,
  type CoachingTone,
} from "@/lib/onboarding";

const steps = [
  "Name",
  "Strengths",
  "Triggers",
  "Preferences",
  "Context",
  "Extension",
];

function toggleValue(list: string[], value: string, max?: number) {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (max && list.length >= max) return list;
  return [...list, value];
}

function OptionButton({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-sm border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-primary bg-primary-light text-primary"
          : "border-border bg-white text-ink hover:border-primary-mid"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

export default function ProfileSetupForm() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [coachingTone, setCoachingTone] = useState<CoachingTone>("direct_kind");
  const [context, setContext] = useState<string[]>([]);
  const [contextOther, setContextOther] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      setUserId(user.id);
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
      setStrengths(profile?.strengths || []);
      setTriggers(profile?.workplace_triggers || []);
      setPreferences(profile?.communication_preferences || []);
      setCoachingTone(profile?.coaching_tone || "direct_kind");
      setContext(profile?.neurodivergent_context || []);
      setContextOther(profile?.neurodivergent_context_other || "");
      setLoading(false);
    }

    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = useMemo(() => {
    if (step === 0) return firstName.trim() && lastName.trim() && displayName.trim();
    if (step === 1) return strengths.length > 0;
    if (step === 2) return triggers.length > 0;
    if (step === 3) return preferences.length > 0 && coachingTone;
    return true;
  }, [coachingTone, displayName, firstName, lastName, preferences.length, step, strengths.length, triggers.length]);

  async function finish() {
    setSaving(true);
    setError("");
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const payload = {
      id: userId,
      email,
      full_name: fullName,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      display_name: displayName.trim(),
      strengths,
      workplace_triggers: triggers,
      communication_preferences: preferences,
      coaching_tone: coachingTone,
      neurodivergent_context: context,
      neurodivergent_context_other: contextOther.trim() || null,
      first_login_complete: true,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      setError(error.message);
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
            Beckett uses this to coach you in a way that fits how you communicate at work.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-6 gap-2">
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
              <h2 className="text-xl text-ink mb-2 font-serif">What are your communication strengths?</h2>
              <p className="text-sm text-ink-mid mb-5">Pick up to three. Beckett starts from what already works.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {strengthOptions.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    selected={strengths.includes(option)}
                    disabled={!strengths.includes(option) && strengths.length >= 3}
                    onClick={() => setStrengths((current) => toggleValue(current, option, 3))}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-light mt-3">{strengths.length}/3 selected</p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">What tends to make work communication harder?</h2>
              <p className="text-sm text-ink-mid mb-5">Pick anything that fits. This shapes how Beckett reads and drafts messages.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {workplaceTriggerOptions.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    selected={triggers.includes(option)}
                    onClick={() => setTriggers((current) => toggleValue(current, option))}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">How should Beckett coach you?</h2>
              <p className="text-sm text-ink-mid mb-5">Choose preferences and a default coaching tone. You can change this later.</p>
              <div className="grid gap-2 sm:grid-cols-2 mb-6">
                {communicationPreferenceOptions.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    selected={preferences.includes(option)}
                    onClick={() => setPreferences((current) => toggleValue(current, option))}
                  />
                ))}
              </div>
              <div className="space-y-2">
                {coachingToneOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCoachingTone(option.value)}
                    className={`w-full text-left rounded-sm border px-3 py-3 transition-colors ${
                      coachingTone === option.value
                        ? "border-primary bg-primary-light"
                        : "border-border hover:border-primary-mid"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink">{option.label}</p>
                    <p className="text-xs text-ink-mid mt-0.5">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">Optional context</h2>
              <p className="text-sm text-ink-mid mb-5">
                This is not required and is never used to diagnose you. It just gives Beckett extra context.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {neurodivergentContextOptions.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    selected={context.includes(option)}
                    onClick={() => setContext((current) => toggleValue(current, option))}
                  />
                ))}
              </div>
              {context.includes("Something else") && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-ink mb-1">Something else</label>
                  <input value={contextOther} onChange={(e) => setContextOther(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">Next: connect the extension</h2>
              <p className="text-sm text-ink-mid mb-5">
                The Beckett extension is where Gmail and Slack coaching happens. You can continue now and connect it from your dashboard.
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
