"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  coachingToneOptions,
  communicationPreferenceOptions,
  neurodivergentContextOptions,
  strengthOptions,
  workplaceTriggerOptions,
  type CoachingTone,
} from "@/lib/onboarding";

type AboutData = {
  communication_style: string;
  triggers: string;
  how_i_work_best: string;
};

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
      className={`text-left rounded-sm border px-3 py-2 text-xs transition-colors ${
        selected
          ? "border-primary bg-primary-light text-primary"
          : "border-border bg-white text-ink hover:border-primary-mid"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

export default function AboutPage() {
  const supabase = createClient();
  const [data, setData] = useState<AboutData>({
    communication_style: "",
    triggers: "",
    how_i_work_best: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [workplaceTriggers, setWorkplaceTriggers] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [coachingTone, setCoachingTone] = useState<CoachingTone>("direct_kind");
  const [neurodivergentContext, setNeurodivergentContext] = useState<string[]>([]);
  const [contextOther, setContextOther] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: aboutData } = await supabase
        .from("user_about")
        .select("communication_style, triggers, how_i_work_best")
        .eq("user_id", user.id)
        .maybeSingle();
      if (aboutData) {
        setData({
          communication_style: aboutData.communication_style || "",
          triggers: aboutData.triggers || "",
          how_i_work_best: aboutData.how_i_work_best || "",
        });
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("strengths, workplace_triggers, communication_preferences, coaching_tone, neurodivergent_context, neurodivergent_context_other")
        .eq("id", user.id)
        .single();
      if (profile) {
        setStrengths(profile.strengths || []);
        setWorkplaceTriggers(profile.workplace_triggers || []);
        setPreferences(profile.communication_preferences || []);
        setCoachingTone(profile.coaching_tone || "direct_kind");
        setNeurodivergentContext(profile.neurodivergent_context || []);
        setContextOther(profile.neurodivergent_context_other || "");
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await supabase.from("user_about").upsert(
      { user_id: user.id, ...data, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await supabase
      .from("profiles")
      .update({
        strengths,
        workplace_triggers: workplaceTriggers,
        communication_preferences: preferences,
        coaching_tone: coachingTone,
        neurodivergent_context: neurodivergentContext,
        neurodivergent_context_other: contextOther.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1
        className="text-3xl text-ink mb-2"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        About Me
      </h1>
      <p className="text-ink-mid text-sm mb-8">
        Help Beckett understand how you communicate. This shapes practice sessions
        and feedback.
      </p>

      <form onSubmit={save} className="space-y-5">
        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            Communication strengths
          </label>
          <p className="text-xs text-ink-light mb-3">
            Pick up to three. Beckett starts from what already works.
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

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            Workplace triggers and hard moments
          </label>
          <p className="text-xs text-ink-light mb-3">
            Beckett uses this to be more careful around the moments that tend to spike stress or confusion.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {workplaceTriggerOptions.map((option) => (
              <OptionButton
                key={option}
                label={option}
                selected={workplaceTriggers.includes(option)}
                onClick={() => setWorkplaceTriggers((current) => toggleValue(current, option))}
              />
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            Communication preferences
          </label>
          <p className="text-xs text-ink-light mb-3">
            Choose how you want Beckett to coach, explain, and draft with you.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 mb-5">
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

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            Neurodivergent context
          </label>
          <p className="text-xs text-ink-light mb-3">
            Optional. This is never used to diagnose you; it just gives Beckett background context.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {neurodivergentContextOptions.map((option) => (
              <OptionButton
                key={option}
                label={option}
                selected={neurodivergentContext.includes(option)}
                onClick={() => setNeurodivergentContext((current) => toggleValue(current, option))}
              />
            ))}
          </div>
          {neurodivergentContext.includes("Something else") && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink mb-1">Something else</label>
              <input
                value={contextOther}
                onChange={(e) => setContextOther(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            How I communicate
          </label>
          <p className="text-xs text-ink-light mb-3">
            How do you naturally communicate? Direct or indirect? Verbose or
            brief? Comfortable with conflict or avoidant?
          </p>
          <textarea
            value={data.communication_style}
            onChange={(e) => setData({ ...data, communication_style: e.target.value })}
            placeholder="e.g. I tend to be indirect and avoid conflict. I over-explain when nervous. I need time to process before responding."
            rows={3}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            My triggers
          </label>
          <p className="text-xs text-ink-light mb-3">
            What kinds of interactions are hardest for you? What tends to throw
            you off?
          </p>
          <textarea
            value={data.triggers}
            onChange={(e) => setData({ ...data, triggers: e.target.value })}
            placeholder="e.g. Being interrupted. Vague feedback. Feeling like I am being judged. Unexpected confrontation."
            rows={3}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <label className="block text-sm font-medium text-ink mb-1">
            How I work best
          </label>
          <p className="text-xs text-ink-light mb-3">
            What conditions help you communicate and collaborate well?
          </p>
          <textarea
            value={data.how_i_work_best}
            onChange={(e) => setData({ ...data, how_i_work_best: e.target.value })}
            placeholder="e.g. I do better with written context before a meeting. I need clear expectations. I work well one-on-one."
            rows={3}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="bg-white border border-border rounded-card p-5 opacity-60">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-ink">
              Team dynamics
            </label>
            <span className="text-xs bg-ink-light/20 text-ink-mid rounded-pill px-2 py-0.5">
              Coming soon
            </span>
          </div>
          <p className="text-xs text-ink-light">
            How you navigate group settings, hierarchies, and team culture.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-white text-sm rounded-pill px-6 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </form>
    </div>
  );
}
