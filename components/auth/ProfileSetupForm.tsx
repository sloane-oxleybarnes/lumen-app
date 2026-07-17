"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AddToSlackButton from "@/components/integrations/AddToSlackButton";
import { createClient } from "@/lib/supabase";
import { hasCurrentBetaConsent } from "@/lib/beta-consent";
import {
  coachingToneOptions,
  communicationPreferenceOptions,
  neurodivergentContextOptions,
  strengthOptions,
  workplaceTriggerOptions,
  type CoachingTone,
} from "@/lib/onboarding";
import { CHROME_WEB_STORE_URL } from "@/lib/app-links";

const steps = [
  "Before we begin",
  "Name",
  "Strengths",
  "Triggers",
  "Coaching",
  "Context",
  "Extension",
];

const chromeExtensionUrl = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL || CHROME_WEB_STORE_URL;

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

function TrustNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-sm border border-primary/15 bg-primary-light/40 p-3 text-xs leading-relaxed text-ink-mid">
      {children}
    </div>
  );
}

export default function ProfileSetupForm() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [adultUsEligibilityConfirmed, setAdultUsEligibilityConfirmed] = useState(false);
  const [termsAndPrivacyConfirmed, setTermsAndPrivacyConfirmed] = useState(false);
  const [coachingDisclaimerConfirmed, setCoachingDisclaimerConfirmed] = useState(false);

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

      setEmail(user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      const hasConsent = hasCurrentBetaConsent(profile);
      if (profile?.first_login_complete && hasConsent) {
        router.replace("/dashboard");
        return;
      }

      if (hasConsent) {
        setAdultUsEligibilityConfirmed(true);
        setTermsAndPrivacyConfirmed(true);
        setCoachingDisclaimerConfirmed(true);
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
    if (step === 0) {
      return adultUsEligibilityConfirmed && termsAndPrivacyConfirmed && coachingDisclaimerConfirmed;
    }
    if (step === 1) return firstName.trim() && lastName.trim() && displayName.trim();
    if (step === 2) return strengths.length > 0;
    if (step === 3) return triggers.length > 0;
    if (step === 4) return preferences.length > 0 && coachingTone;
    return true;
  }, [adultUsEligibilityConfirmed, coachingDisclaimerConfirmed, coachingTone, displayName, firstName, lastName, preferences.length, step, strengths.length, termsAndPrivacyConfirmed, triggers.length]);

  async function completeOnboarding(destination: "dashboard" | "gmail" | "slack" = "dashboard") {
    setSaving(true);
    setError("");
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const payload = {
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
      adult_us_eligibility_confirmed: adultUsEligibilityConfirmed,
      terms_accepted: termsAndPrivacyConfirmed,
      privacy_acknowledged: termsAndPrivacyConfirmed,
      coaching_disclaimer_acknowledged: coachingDisclaimerConfirmed,
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

    if (destination === "gmail") {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "https://www.googleapis.com/auth/gmail.readonly",
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard/settings")}&integration=google`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      return;
    }

    if (destination === "slack") {
      window.location.href = "/api/slack/connect";
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  function next() {
    if (!canContinue) return;
    if (step === steps.length - 1) completeOnboarding();
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
            Beckett beta is workplace-first. Your answers help your coach support Gmail,
            Slack, practice conversations, and workplace skill modules.
          </p>
        </div>

        <div
          className="mb-5 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
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
              <h2 className="text-xl text-ink mb-2 font-serif">Before we begin</h2>
              <p className="text-sm text-ink-mid mb-5">
                Beckett&apos;s beta is currently available to adults in the United States. Please
                review and confirm each item before setting up your coach.
              </p>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-4 transition-colors hover:border-primary-mid">
                  <input
                    type="checkbox"
                    checked={adultUsEligibilityConfirmed}
                    onChange={(event) => setAdultUsEligibilityConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-sm leading-relaxed text-ink">
                    I confirm that I am at least 18 years old and currently located in the United States.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-4 transition-colors hover:border-primary-mid">
                  <input
                    type="checkbox"
                    checked={termsAndPrivacyConfirmed}
                    onChange={(event) => setTermsAndPrivacyConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-sm leading-relaxed text-ink">
                    I agree to Beckett&apos;s{" "}
                    <Link href="/terms" target="_blank" className="text-primary underline underline-offset-2">
                      Terms of Use
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link href="/privacy" target="_blank" className="text-primary underline underline-offset-2">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-4 transition-colors hover:border-primary-mid">
                  <input
                    type="checkbox"
                    checked={coachingDisclaimerConfirmed}
                    onChange={(event) => setCoachingDisclaimerConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-sm leading-relaxed text-ink">
                    I understand that Beckett provides communication coaching, not medical,
                    mental-health, legal, or employment advice.
                  </span>
                </label>
              </div>
              <div className="mt-5">
                <TrustNote>
                  Beckett records when you accept these items and which policy versions you
                  reviewed. It does not ask for or store your date of birth.
                </TrustNote>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">What should Beckett call you?</h2>
              <p className="text-sm text-ink-mid mb-5">
                This is used inside your Beckett account and coaching prompts. It is not shown
                publicly to other users.
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
                  <label className="block text-sm font-medium text-ink mb-1">What do you want Beckett to call you?</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="mt-5">
                <TrustNote>
                  Your setup answers are saved to your Beckett profile so Beckett can coach you
                  more accurately. They are not shared publicly, and they are not used to train
                  public AI models. You can edit or remove them later.
                </TrustNote>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">What are your communication strengths?</h2>
              <p className="text-sm text-ink-mid mb-5">
                Pick up to three. Beckett starts from what already works in workplace conversations.
              </p>
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

          {step === 3 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">What tends to make work communication harder?</h2>
              <p className="text-sm text-ink-mid mb-5">
                Pick anything that fits. This helps Beckett notice where messages, feedback,
                tone, or expectations may need extra care.
              </p>
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

          {step === 4 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">How should Beckett coach you?</h2>
              <p className="text-sm text-ink-mid mb-5">
                First choose what kind of help you want. Then choose the tone Beckett should use
                when giving coaching feedback.
              </p>
              <div className="mb-6">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">
                  What do you want help with?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                {communicationPreferenceOptions.map((option) => (
                  <OptionButton
                    key={option}
                    label={option}
                    selected={preferences.includes(option)}
                    onClick={() => setPreferences((current) => toggleValue(current, option))}
                  />
                ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-light">
                  How should Beckett sound as your coach?
                </p>
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

          {step === 5 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">
                Is there any neurodivergent context you want Beckett to know?
              </h2>
              <p className="text-sm text-ink-mid mb-5">
                Optional. This can include ADHD, autism, dyslexia, sensory processing differences,
                or anything else that helps Beckett coach you better. Beckett does not diagnose you.
              </p>
              <div className="mb-5">
                <TrustNote>
                  This context is saved to your Beckett profile and used only to shape your coaching.
                  It is not shown publicly, and you can skip this or edit it later.
                </TrustNote>
              </div>
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

          {step === 6 && (
            <div>
              <h2 className="text-xl text-ink mb-2 font-serif">Connect your work tools</h2>
              <p className="text-sm text-ink-mid mb-5">
                Beckett works best when your coach is connected to the places your work conversations happen.
                You can skip this for now and finish setup from Settings.
              </p>
              <div className="mb-4">
                <TrustNote>
                  Connecting a tool lets Beckett use that tool only for coaching you request.
                  Beckett stores connection status, usage counts, and beta debugging metadata, not
                  full Gmail or Slack message history by default.
                </TrustNote>
              </div>
              <div className="mb-4">
                <TrustNote>
                  During beta, you get 60 successful coaching actions per day and 500 per month.
                  Only completed coaching responses use a credit; skill-course activities do not.
                </TrustNote>
              </div>
              <div className="space-y-3">
                <div className="rounded-sm border border-border bg-bg/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink">1. Install Beckett for Chrome</p>
                      <p className="mt-1 text-xs text-ink-mid">
                        After installing, open the extension and choose Log in with Beckett.
                      </p>
                    </div>
                    {chromeExtensionUrl ? (
                      <a
                        href={chromeExtensionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
                      >
                        Open
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="shrink-0 rounded-pill bg-ink-light/20 px-4 py-2 text-xs font-medium text-ink-mid"
                      >
                        Soon
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-sm border border-border bg-bg/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink">2. Connect Gmail</p>
                      <p className="mt-1 text-xs text-ink-mid">
                        Gives Beckett read-only Gmail access so it can use full email threads when
                        you ask for coaching. Beckett cannot send emails for you.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => completeOnboarding("gmail")}
                      disabled={saving}
                      className="shrink-0 rounded-pill border border-border px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-primary-mid disabled:opacity-50"
                    >
                      Connect
                    </button>
                  </div>
                </div>

                <div className="rounded-sm border border-border bg-bg/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink">3. Connect Slack</p>
                      <p className="mt-1 text-xs text-ink-mid">
                        Lets Beckett use recent Slack DMs, channels, and threads when you ask for
                        coaching. After connecting, use <code className="font-mono text-ink">/beckett</code> in Slack
                        Desktop for rewrite, decode, draft, prep, tone, and follow-up help. Beckett
                        cannot post messages for you.
                      </p>
                    </div>
                    <AddToSlackButton
                      onClick={() => completeOnboarding("slack")}
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-light">
                You can skip any of these for now. Beckett will keep nudging you from Settings until setup is complete.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-5" role="alert">{error}</p>}

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
