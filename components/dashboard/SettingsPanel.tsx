"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";
import {
  coachingToneOptions,
  communicationPreferenceOptions,
  neurodivergentContextOptions,
  strengthOptions,
  workplaceTriggerOptions,
  type CoachingTone,
} from "@/lib/onboarding";

function ConnectRow({
  icon,
  name,
  description,
  onConnect,
  extensionOnly,
}: {
  icon: string;
  name: string;
  description: string;
  onConnect?: () => void;
  extensionOnly?: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{icon}</span>
        <div>
          <p className="text-sm text-ink font-medium">{name}</p>
          <p className="text-xs text-ink-light">{description}</p>
          {notice && <p className="text-xs text-ink-mid mt-1">{notice}</p>}
        </div>
      </div>
      <button
        onClick={() => {
          if (extensionOnly) {
            setNotice("Connect via the Beckett extension. Dashboard OAuth coming soon.");
          } else {
            onConnect?.();
          }
        }}
        className="shrink-0 text-xs border border-border rounded-pill px-4 py-1.5 text-ink hover:bg-bg transition-colors"
      >
        Connect
      </button>
    </div>
  );
}

const planBadgeColor: Record<string, string> = {
  free: "bg-ink-light/20 text-ink-mid",
  beta: "bg-primary-light text-primary",
  pro: "bg-primary text-white",
  team: "bg-amber-100 text-amber-700",
};

function toggleValue(list: string[], value: string, max?: number) {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (max && list.length >= max) return list;
  return [...list, value];
}

function SettingsOption({
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
      className={`text-left rounded-sm border px-3 py-2 text-xs transition-colors ${
        selected
          ? "border-primary bg-primary-light text-primary"
          : "border-border text-ink hover:border-primary-mid"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [betaCode, setBetaCode] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "success" | "error">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [coachingTone, setCoachingTone] = useState<CoachingTone>("direct_kind");
  const [context, setContext] = useState<string[]>([]);
  const [contextOther, setContextOther] = useState("");
  const [deletionNotes, setDeletionNotes] = useState("");
  const [deletionStatus, setDeletionStatus] = useState<"idle" | "loading" | "requested" | "error">("idle");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data: profileData }) => {
          setProfile(profileData as Profile);
          setFullName(profileData?.full_name || "");
          setFirstName(profileData?.first_name || "");
          setLastName(profileData?.last_name || "");
          setDisplayName(profileData?.display_name || profileData?.first_name || "");
          setStrengths(profileData?.strengths || []);
          setTriggers(profileData?.workplace_triggers || []);
          setPreferences(profileData?.communication_preferences || []);
          setCoachingTone(profileData?.coaching_tone || "direct_kind");
          setContext(profileData?.neurodivergent_context || []);
          setContextOther(profileData?.neurodivergent_context_other || "");
        });
    });
  }, [supabase]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function saveCoachingProfile(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    const nextFullName = `${firstName.trim()} ${lastName.trim()}`.trim() || fullName;
    const update = {
      full_name: nextFullName,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      strengths,
      workplace_triggers: triggers,
      communication_preferences: preferences,
      coaching_tone: coachingTone,
      neurodivergent_context: context,
      neurodivergent_context_other: contextOther.trim() || null,
      updated_at: new Date().toISOString(),
    };

    await supabase.from("profiles").update(update).eq("id", user.id);
    setProfile((current) => current ? { ...current, ...update } : current);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  async function clearCoachingProfile() {
    if (!window.confirm("Clear your Beckett coaching profile answers? You can add them again later.")) {
      return;
    }
    setStrengths([]);
    setTriggers([]);
    setPreferences([]);
    setCoachingTone("direct_kind");
    setContext([]);
    setContextOther("");

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        strengths: [],
        workplace_triggers: [],
        communication_preferences: [],
        coaching_tone: "direct_kind",
        neurodivergent_context: [],
        neurodivergent_context_other: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    await supabase.auth.updateUser({ password: newPassword });
    setNewPassword("");
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 3000);
  }

  function activateBetaCode() {
    // TODO: validate against Supabase beta_codes table
    if (betaCode.length > 0) {
      setBetaStatus("success");
    } else {
      setBetaStatus("error");
    }
  }

  async function requestDeletion() {
    if (
      !window.confirm(
        "Request account deletion? Beckett will disable follow-up and manually delete your account and personal data within 30 days."
      )
    ) {
      return;
    }

    setDeletionStatus("loading");
    const res = await fetch("/api/account/deletion-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: deletionNotes }),
    });

    if (!res.ok) {
      setDeletionStatus("error");
      return;
    }

    const data = await res.json().catch(() => ({}));
    setProfile((current) =>
      current
        ? {
            ...current,
            deletion_status: "requested",
            deletion_requested_at: data.requested_at || new Date().toISOString(),
            deletion_notes: deletionNotes || null,
          }
        : current
    );
    setDeletionStatus("requested");
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1
        className="text-3xl text-ink mb-8"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        Settings
      </h1>

      {/* Profile */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Account
        </h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email</label>
            <input
              type="email"
              value={profile.email}
              readOnly
              className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-bg text-ink-light cursor-not-allowed"
            />
            <p className="text-xs text-ink-light mt-1">
              Email changes are handled via Supabase Auth.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="block text-sm font-medium text-ink">Plan</label>
            <span
              className={`text-xs font-medium rounded-pill px-2.5 py-0.5 capitalize ${planBadgeColor[profile.plan]}`}
            >
              {profile.plan}
            </span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Change password
        </h2>
        <form onSubmit={changePassword} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            minLength={8}
            required
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors"
          >
            {pwSaved ? "Password updated ✓" : "Update password"}
          </button>
        </form>
      </section>

      {/* Coaching profile */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Coaching profile
        </h2>
        <p className="text-sm text-ink-mid mb-5">
          These answers shape how Beckett coaches you. You can edit or clear them anytime.
        </p>
        <form onSubmit={saveCoachingProfile} className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-sm font-medium text-ink">Strengths</label>
              <span className="text-xs text-ink-light">{strengths.length}/3 selected</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {strengthOptions.map((option) => (
                <SettingsOption
                  key={option}
                  label={option}
                  selected={strengths.includes(option)}
                  disabled={!strengths.includes(option) && strengths.length >= 3}
                  onClick={() => setStrengths((current) => toggleValue(current, option, 3))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Workplace triggers</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {workplaceTriggerOptions.map((option) => (
                <SettingsOption
                  key={option}
                  label={option}
                  selected={triggers.includes(option)}
                  onClick={() => setTriggers((current) => toggleValue(current, option))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Communication preferences</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {communicationPreferenceOptions.map((option) => (
                <SettingsOption
                  key={option}
                  label={option}
                  selected={preferences.includes(option)}
                  onClick={() => setPreferences((current) => toggleValue(current, option))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Coaching tone</label>
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

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Optional neurodivergent context
            </label>
            <p className="text-xs text-ink-light mb-3">
              Beckett uses this quietly in the background. It is not required.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {neurodivergentContextOptions.map((option) => (
                <SettingsOption
                  key={option}
                  label={option}
                  selected={context.includes(option)}
                  onClick={() => setContext((current) => toggleValue(current, option))}
                />
              ))}
            </div>
            {context.includes("Something else") && (
              <input
                value={contextOther}
                onChange={(e) => setContextOther(e.target.value)}
                placeholder="Add your own context"
                className="mt-3 w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors"
            >
              {profileSaved ? "Saved ✓" : "Save coaching profile"}
            </button>
            <button
              type="button"
              onClick={clearCoachingProfile}
              className="text-sm border border-border rounded-pill px-5 py-2 text-ink hover:bg-bg transition-colors"
            >
              Clear answers
            </button>
          </div>
        </form>
      </section>

      {/* Connected accounts */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Connected accounts
        </h2>
        <p className="text-sm text-ink-mid mb-5">
          Connect your accounts to unlock email context, calendar briefs, and message history.
        </p>
        <div className="space-y-4">
          {/* Google / Gmail */}
          <ConnectRow
            icon="📧"
            name="Google (Gmail + Calendar)"
            description="Email context and upcoming meetings"
            onConnect={async () => {
              await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
                  redirectTo: `${window.location.origin}/dashboard/settings`,
                  queryParams: { access_type: "offline", prompt: "consent" },
                },
              });
            }}
          />
          {/* Slack */}
          <ConnectRow
            icon="💬"
            name="Slack"
            description="Message history and contact context"
            extensionOnly
          />
          {/* LinkedIn */}
          <ConnectRow
            icon="💼"
            name="LinkedIn"
            description="Professional context for contacts"
            extensionOnly
          />
        </div>
      </section>

      {/* Extension setup */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Extension setup
        </h2>
        <p className="text-sm text-ink-mid mb-4">
          Beckett for Chrome will connect through a secure login flow.
        </p>
        <div className="rounded-sm border border-primary/20 bg-primary-light p-4">
          <p className="text-sm font-medium text-ink">Included in beta access</p>
          <p className="text-xs text-ink-mid mt-1">
            The next extension build will remove token copy/paste and connect directly to your Beckett account.
          </p>
        </div>
      </section>

      {/* Beta code */}
      {profile.plan === "free" && (
        <section className="bg-white rounded-card border border-border p-6 mb-5">
          <h2
            className="text-lg text-ink mb-1"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Beta code
          </h2>
          <p className="text-sm text-ink-mid mb-4">
            Have a beta code? Enter it to unlock Pro access.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value)}
              placeholder="Enter code"
              className="flex-1 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={activateBetaCode}
              className="bg-primary text-white text-sm rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors"
            >
              Activate
            </button>
          </div>
          {betaStatus === "success" && (
            <p className="text-green-600 text-xs mt-2">Activated — reloading your plan…</p>
          )}
          {betaStatus === "error" && (
            <p className="text-red-600 text-xs mt-2">Code not recognised. Try again.</p>
          )}
        </section>
      )}

      {/* Danger zone */}
      <section className="bg-white rounded-card border border-red-200 p-6">
        <h2
          className="text-lg text-red-700 mb-2"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Danger zone
        </h2>
        {profile.deletion_requested_at ? (
          <div className="rounded-sm border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">Deletion requested</p>
            <p className="text-xs text-red-700/80 mt-1">
              We received your request on{" "}
              {new Date(profile.deletion_requested_at).toLocaleDateString()}. Your account and
              personal data will be manually deleted within 30 days.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-mid mb-4">
              During beta, deletion is handled manually so we can remove data across Beckett,
              Supabase, HubSpot, Loops, and related systems.
            </p>
            <label className="block text-sm font-medium text-ink mb-1">
              Optional note
            </label>
            <textarea
              value={deletionNotes}
              onChange={(e) => setDeletionNotes(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              placeholder="Anything you want us to know?"
            />
            <button
              className="text-red-600 border border-red-200 text-sm rounded-pill px-5 py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
              onClick={requestDeletion}
              disabled={deletionStatus === "loading"}
            >
              {deletionStatus === "loading" ? "Requesting…" : "Request account deletion"}
            </button>
            {deletionStatus === "requested" && (
              <p className="text-xs text-red-700 mt-3">
                Request received. We will complete deletion within 30 days.
              </p>
            )}
            {deletionStatus === "error" && (
              <p className="text-xs text-red-700 mt-3">
                Something went wrong. Please email hello@meetbeckett.co.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
