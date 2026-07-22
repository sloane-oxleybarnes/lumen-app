"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AddToSlackButton from "@/components/integrations/AddToSlackButton";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";
import {
  coachingToneOptions,
  communicationPreferenceOptions,
  type CoachingTone,
} from "@/lib/onboarding";
import { CHROME_WEB_STORE_URL } from "@/lib/app-links";
import {
  DEFAULT_PROACTIVITY_PREFERENCE,
  proactivityOptions,
  type ProactivityPreference,
} from "@/lib/workday-coaching";
import CompanionControls from "@/app/dashboard/companion/CompanionControls";
import WorkdayReminders from "@/components/dashboard/WorkdayReminders";

function ConnectRow({
  icon,
  name,
  description,
  onConnect,
  onDisconnect,
  connected,
  detail,
  disconnecting,
}: {
  icon: string;
  name: string;
  description: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  connected?: boolean;
  detail?: string;
  disconnecting?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{icon}</span>
        <div>
          <p className="text-sm text-ink font-medium">{name}</p>
          <p className="text-xs text-ink-light">{connected && detail ? detail : description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {connected && (
          <span className="rounded-pill bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Connected
          </span>
        )}
        <button
          type="button"
          onClick={() => onConnect?.()}
          disabled={disconnecting}
          className="text-xs border border-border rounded-pill px-4 py-1.5 text-ink hover:bg-bg transition-colors"
        >
          {connected ? "Reconnect" : "Connect"}
        </button>
        {connected && onDisconnect && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="text-xs border border-red-200 rounded-pill px-4 py-1.5 text-red-700 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}

const planBadgeColor: Record<string, string> = {
  free: "bg-ink-light/20 text-ink-mid",
  beta: "bg-primary-light text-primary",
  pro: "bg-primary text-white",
  team: "bg-amber-100 text-amber-700",
};

const slackCommandExamples = [
  "/beckett rewrite \"Any update on this?\"",
  "/beckett decode \"Sure, sounds fine.\"",
  "/beckett draft ask my manager for clearer priorities this week",
  "/beckett prep I need to give a teammate feedback",
  "/beckett tone \"I need this by Friday.\"",
  "/beckett followup remind Avery about the readout",
];

function toggleValue(list: string[], value: string, max?: number) {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (max && list.length >= max) return list;
  return [...list, value];
}

function splitCustomEntries(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeCustomEntries(list: string[], value: string) {
  const next = [...list];
  const existing = new Set(next.map((item) => item.toLowerCase()));

  for (const entry of splitCustomEntries(value)) {
    const key = entry.toLowerCase();
    if (existing.has(key)) continue;
    next.push(entry);
    existing.add(key);
  }

  return next;
}

function getCustomValues(values: string[], presetOptions: string[]) {
  const presets = new Set(presetOptions.map((item) => item.toLowerCase()));
  return values.filter((value) => !presets.has(value.toLowerCase()));
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

function CustomPreferenceControls({
  value,
  onChange,
  onAdd,
  values,
  onRemove,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  values: string[];
  onRemove: (value: string) => void;
}) {
  const customValues = getCustomValues(values, communicationPreferenceOptions);

  return (
    <div className="mt-4 rounded-sm border border-border bg-bg/60 p-3">
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-light">
        Add your own
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Separate each preference with a comma"
          className="min-w-0 flex-1 rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={splitCustomEntries(value).length === 0}
          className="rounded-pill border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-primary-mid hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {customValues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {customValues.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRemove(item)}
              className="rounded-pill bg-white px-3 py-1 text-xs text-ink-mid transition-colors hover:bg-red-50 hover:text-red-700"
              aria-label={`Remove ${item}`}
            >
              {item} x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Diagnostics = {
  beckett: {
    authenticated: boolean;
    email: string | null;
    plan: string;
  };
  extension: {
    tokenIssued: boolean;
    lastProfileSyncAt: string | null;
  };
  integrations: {
    slack: {
      connected: boolean;
      userId?: string | null;
      teamId?: string | null;
      teamName?: string | null;
      connectedAt?: string | null;
      updatedAt?: string | null;
    };
    google: {
      connected: boolean;
      email?: string | null;
      connectedAt?: string | null;
      updatedAt?: string | null;
    };
  };
  aiUsage: {
    limit: number;
    used: number;
    remaining: number;
    unlimited?: boolean;
  };
  api: {
    reachable: boolean;
    checkedAt: string;
  };
};

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
  const [editingCoachingSettings, setEditingCoachingSettings] = useState(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [coachingTone, setCoachingTone] = useState<CoachingTone>("direct_kind");
  const [proactivityPreference, setProactivityPreference] = useState<ProactivityPreference>(
    DEFAULT_PROACTIVITY_PREFERENCE
  );
  const [patternModelEnabled, setPatternModelEnabled] = useState(false);
  const [customPreferences, setCustomPreferences] = useState("");
  const [deletionNotes, setDeletionNotes] = useState("");
  const [deletionStatus, setDeletionStatus] = useState<"idle" | "loading" | "requested" | "error">("idle");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<"google" | "slack" | null>(null);

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
          setPreferences(profileData?.communication_preferences || []);
          setCoachingTone(profileData?.coaching_tone || "direct_kind");
          setProactivityPreference(
            profileData?.proactive_coaching_preference || DEFAULT_PROACTIVITY_PREFERENCE
          );
          setPatternModelEnabled(profileData?.pattern_model_enabled || false);
        });
    });
  }, [supabase]);

  const loadDiagnostics = useCallback(async () => {
    try {
      const res = await fetch("/api/extension/diagnostics", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load diagnostics.");
      setDiagnostics((await res.json()) as Diagnostics);
    } catch (error) {
      console.error("Could not load account connection status.", error);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  async function disconnectIntegration(provider: "google" | "slack") {
    const label = provider === "google" ? "Google (Gmail)" : "Slack";
    const confirmed = window.confirm(
      `Disconnect ${label}? Beckett will stop using it for future coaching. Existing Beckett coaching history and contacts will not be deleted.`
    );
    if (!confirmed) return;

    setDisconnectingProvider(provider);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || `Could not disconnect ${label}.`);
      await loadDiagnostics();
    } catch (error) {
      console.error(`Could not disconnect ${label}.`, error);
    } finally {
      setDisconnectingProvider(null);
    }
  }

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

  async function saveCoachingSettings(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    const update = {
      communication_preferences: preferences,
      coaching_tone: coachingTone,
      proactive_coaching_preference: proactivityPreference,
      pattern_model_enabled: patternModelEnabled,
      updated_at: new Date().toISOString(),
    };

    await supabase.from("profiles").update(update).eq("id", user.id);
    setProfile((current) => current ? { ...current, ...update } : current);
    setProfileSaved(true);
    setEditingCoachingSettings(false);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  async function clearCoachingSettings() {
    if (!window.confirm("Clear your Beckett coaching settings? You can add them again later.")) {
      return;
    }
    setPreferences([]);
    setCoachingTone("direct_kind");
    setProactivityPreference(DEFAULT_PROACTIVITY_PREFERENCE);
    setPatternModelEnabled(false);
    setCustomPreferences("");

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        communication_preferences: [],
        coaching_tone: "direct_kind",
        proactive_coaching_preference: DEFAULT_PROACTIVITY_PREFERENCE,
        pattern_model_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setEditingCoachingSettings(false);
  }

  function addCustomPreferences() {
    setPreferences((current) => mergeCustomEntries(current, customPreferences));
    setCustomPreferences("");
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

      <WorkdayReminders />

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

      {/* Beckett coaching settings */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Beckett&apos;s Coaching Settings
        </h2>
        <p className="text-sm text-ink-mid mb-5">
          Choose how Beckett coaches, explains, and drafts with you. Personal profile details
          live in About Me.
        </p>
        {!editingCoachingSettings ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-ink">What Beckett helps with</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {preferences.length ? preferences.map((preference) => (
                  <span key={preference} className="rounded-pill bg-primary-light px-3 py-1 text-xs font-medium text-primary">
                    {preference}
                  </span>
                )) : <p className="text-sm text-ink-mid">No specific preferences selected.</p>}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Coaching tone</p>
              <p className="mt-1 text-sm text-ink-mid">
                {coachingToneOptions.find((option) => option.value === coachingTone)?.label || "Direct and kind"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Workday coaching</p>
              <p className="mt-1 text-sm text-ink-mid">
                {proactivityOptions.find((option) => option.value === proactivityPreference)?.label || "Only when I ask"}
                {patternModelEnabled ? " · Pattern summaries enabled" : " · Pattern summaries off"}
              </p>
            </div>
            <CompanionControls readOnly />
            <button
              type="button"
              onClick={() => setEditingCoachingSettings(true)}
              className="rounded-pill border border-border px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-primary-mid hover:bg-primary-light"
            >
              Edit coaching settings
            </button>
          </div>
        ) : <form onSubmit={saveCoachingSettings} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">What I Want Beckett to Help Me With</label>
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
            <CustomPreferenceControls
              value={customPreferences}
              onChange={setCustomPreferences}
              onAdd={addCustomPreferences}
              values={preferences}
              onRemove={(value) => setPreferences((current) => current.filter((item) => item !== value))}
            />
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

          <div className="border-t border-border pt-6">
            <label className="block text-sm font-medium text-ink mb-1">Workday coaching</label>
            <p className="mb-3 text-xs leading-relaxed text-ink-mid">
              These are your preferences for future workday support. During beta, Beckett will not
              interrupt your work or observe patterns unless you explicitly ask it to help.
            </p>
            <div className="space-y-2">
              {proactivityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setProactivityPreference(option.value)}
                  className={`w-full text-left rounded-sm border px-3 py-3 transition-colors ${
                    proactivityPreference === option.value
                      ? "border-primary bg-primary-light"
                      : "border-border hover:border-primary-mid"
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{option.label}</p>
                  <p className="mt-0.5 text-xs text-ink-mid">{option.description}</p>
                </button>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-bg/50 p-3">
              <input
                type="checkbox"
                checked={patternModelEnabled}
                onChange={(event) => setPatternModelEnabled(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-ink">Allow future pattern summaries</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-mid">
                  When this capability is introduced, Beckett may save high-level summaries you ask it to create—such as helpful strategies or recurring friction. It will not store full workday history by default.
                </span>
              </span>
            </label>
          </div>

          <CompanionControls />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors"
            >
              {profileSaved ? "Saved ✓" : "Save coaching settings"}
            </button>
            <button
              type="button"
              onClick={clearCoachingSettings}
              className="text-sm border border-border rounded-pill px-5 py-2 text-ink hover:bg-bg transition-colors"
            >
              Clear settings
            </button>
            <button
              type="button"
              onClick={() => setEditingCoachingSettings(false)}
              className="text-sm text-ink-mid hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>}
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
          Connect only the tools you want Beckett to use for coaching. Beckett stores connection
          status and usage metadata, not full Gmail or Slack message history by default.
        </p>
        <div className="mb-5 rounded-sm border border-primary/15 bg-primary-light/40 p-3 text-xs leading-relaxed text-ink-mid">
          Gmail is read-only and Slack is used only for context. Beckett cannot send email, post to
          Slack, move meetings, or change anything without you taking the final action. Disconnecting
          stops future access but does not delete your existing Beckett coaching history or contacts.
        </div>
        <div className="space-y-4">
          {/* Google / Gmail */}
          <ConnectRow
            icon="📧"
            name="Google (Gmail)"
            description="Read-only email thread context when you ask Beckett for coaching"
            connected={diagnostics?.integrations.google.connected}
            detail={diagnostics?.integrations.google.email || "Google account connected"}
            onConnect={async () => {
              await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  scopes: "https://www.googleapis.com/auth/gmail.readonly",
                  redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard/settings")}&integration=google`,
                  queryParams: { access_type: "offline", prompt: "consent" },
                },
              });
            }}
            onDisconnect={() => void disconnectIntegration("google")}
            disconnecting={disconnectingProvider === "google"}
          />
          {/* Slack */}
          <ConnectRow
            icon="💬"
            name="Slack"
            description="Recent DM, channel, and thread context when you ask Beckett for coaching"
            connected={diagnostics?.integrations.slack.connected}
            detail={diagnostics?.integrations.slack.teamName || "Slack workspace connected"}
            onConnect={() => {
              window.location.href = "/api/slack/connect";
            }}
            onDisconnect={() => void disconnectIntegration("slack")}
            disconnecting={disconnectingProvider === "slack"}
          />
          <div className="rounded-sm border border-border bg-bg/60 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <p className="text-sm font-medium text-ink">Slack quickstart</p>
                <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-mid">
                  <li>1. Connect Slack from Beckett Settings.</li>
                  <li>2. Approve Beckett for your workspace. Some workspaces may require admin approval.</li>
                  <li>3. Open Slack Desktop and type <code className="font-mono text-ink">/beckett</code>.</li>
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-ink-mid">
                  For a specific Slack message, use the message shortcuts: <span className="font-medium text-ink">Beckett - Decode</span> or <span className="font-medium text-ink">Beckett - Respond</span>.
                </p>
                {!diagnostics?.integrations.slack.connected && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <AddToSlackButton href="/api/slack/connect" />
                    <span className="text-xs leading-relaxed text-ink-light">
                      Connects this Slack workspace to your Beckett account.
                    </span>
                  </div>
                )}
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:max-w-lg">
                {slackCommandExamples.map((example) => (
                  <code
                    key={example}
                    className="break-words rounded-sm border border-primary/15 bg-white px-2.5 py-2 text-[11px] leading-snug text-ink"
                  >
                    {example}
                  </code>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-ink">Beckett for Chrome</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-mid">
              Install the extension, then use “Log in with Beckett” in its side panel if it is not connected.
            </p>
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Install extension
            </a>
          </div>
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

      {/* Dashboard tour and safety resources */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Dashboard tour
        </h2>
        <p className="text-sm text-ink-mid mb-4">
          Replay Beckett&apos;s short walkthrough of the dashboard, practice, skills, setup,
          About Me, and Settings.
        </p>
        <Link
          href="/dashboard?tour=1"
          className="inline-flex rounded-pill border border-border px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-primary-mid hover:bg-primary-light"
        >
          Restart dashboard tour
        </Link>
      </section>

      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2 className="text-lg text-ink mb-1" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
          Safety and resources
        </h2>
        <p className="text-sm text-ink-mid mb-4">
          Review what Beckett can help with, its boundaries, and topic-specific resources for urgent, medical, legal, and relationship-safety support.
        </p>
        <Link href="/dashboard/safety" className="inline-flex rounded-pill border border-border px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-primary-mid hover:bg-primary-light">
          View safety resources
        </Link>
      </section>

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
            <p className="mb-4 text-xs leading-relaxed text-ink-light">
              We will mark your account for deletion, stop beta follow-up where possible, and remove
              personal data from the systems we use to run the beta. We may keep limited records only
              when needed for security, legal, or abuse-prevention reasons.
            </p>
            <label htmlFor="account-deletion-note" className="block text-sm font-medium text-ink mb-1">
              Optional note
            </label>
            <textarea
              id="account-deletion-note"
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
              <p className="text-xs text-red-700 mt-3" role="status" aria-live="polite">
                Request received. We will complete deletion within 30 days.
              </p>
            )}
            {deletionStatus === "error" && (
              <p className="text-xs text-red-700 mt-3" role="alert">
                Something went wrong. Please email hello@meetbeckett.co.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
