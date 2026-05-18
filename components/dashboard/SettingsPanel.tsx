"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Profile } from "@/lib/supabase";

const planBadgeColor: Record<string, string> = {
  free: "bg-ink-light/20 text-ink-mid",
  beta: "bg-primary-light text-primary",
  pro: "bg-primary text-white",
  team: "bg-amber-100 text-amber-700",
};

export default function SettingsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [betaCode, setBetaCode] = useState("");
  const [betaStatus, setBetaStatus] = useState<"idle" | "success" | "error">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

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

      {/* Connected accounts */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Connected accounts
        </h2>
        <div className="space-y-3">
          {[
            { name: "Gmail", icon: "📧", status: "not connected" },
            { name: "Slack", icon: "💬", status: "not connected" },
            { name: "LinkedIn", icon: "💼", status: "not connected" },
          ].map((acc) => (
            <div key={acc.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{acc.icon}</span>
                <span className="text-sm text-ink">{acc.name}</span>
              </div>
              <span className="text-xs text-ink-light">{acc.status}</span>
            </div>
          ))}
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
        <p className="text-sm text-ink-mid mb-4">
          Deleting your account is permanent. All your data will be removed.
        </p>
        <button
          className="text-red-600 border border-red-200 text-sm rounded-pill px-5 py-2 hover:bg-red-50 transition-colors"
          onClick={() => {
            if (
              window.confirm(
                "Are you sure you want to delete your account? This cannot be undone."
              )
            ) {
              // TODO: call delete account API
            }
          }}
        >
          Delete account
        </button>
      </section>
    </div>
  );
}
