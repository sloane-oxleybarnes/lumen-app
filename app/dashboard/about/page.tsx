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

type ToolkitItem = {
  id: string;
  course_id: string;
  category: string;
  label: string;
  content: string;
  created_at: string;
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

function SummaryChips({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <p className="text-sm text-ink-light">Nothing selected yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-pill bg-bg px-3 py-1 text-xs text-ink-mid">
          {value}
        </span>
      ))}
    </div>
  );
}

function SummarySection({
  title,
  description,
  values,
  editing,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  values: string[];
  editing: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-card p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">{title}</label>
          <p className="text-xs text-ink-light">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? <div>{children}</div> : <SummaryChips values={values} />}
    </div>
  );
}

function TextAreaCard({
  title,
  description,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="bg-white border border-border rounded-card p-5">
      <label className="block text-sm font-medium text-ink mb-1">{title}</label>
      <p className="text-xs text-ink-light mb-3">{description}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </div>
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
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());
  const [toolkitItems, setToolkitItems] = useState<ToolkitItem[]>([]);
  const [deletingToolkitId, setDeletingToolkitId] = useState<string | null>(null);

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
      const toolkitRes = await fetch("/api/course-toolkit");
      if (toolkitRes.ok) {
        const toolkitData = (await toolkitRes.json().catch(() => ({}))) as { items?: ToolkitItem[] };
        setToolkitItems(toolkitData.items || []);
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

  function toggleSection(section: string) {
    setEditingSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  async function deleteToolkitItem(id: string) {
    setDeletingToolkitId(id);
    const res = await fetch("/api/course-toolkit", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeletingToolkitId(null);
    if (res.ok) setToolkitItems((current) => current.filter((item) => item.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
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
          <div className="mb-4">
            <h2 className="text-sm font-medium text-ink mb-1">Communication toolkit</h2>
            <p className="text-xs text-ink-light">
              Phrases and questions you created in Beckett courses. Delete anything you do not want to keep.
            </p>
          </div>
          {toolkitItems.length === 0 ? (
            <p className="text-sm text-ink-light">Nothing saved yet. Course phrases will appear here after you build them.</p>
          ) : (
            <div className="space-y-3">
              {toolkitItems.map((item) => (
                <div key={item.id} className="rounded-card border border-border bg-bg p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-primary">{item.label}</p>
                      <p className="text-[11px] uppercase tracking-wide text-ink-light">{item.category.replace(/_/g, " ")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteToolkitItem(item.id)}
                      disabled={deletingToolkitId === item.id}
                      className="text-xs text-ink-light hover:text-red-600 disabled:opacity-50"
                    >
                      {deletingToolkitId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <SummarySection
          title="Communication strengths"
          description="Pick up to three. Beckett starts from what already works."
          values={strengths}
          editing={editingSections.has("strengths")}
          onToggle={() => toggleSection("strengths")}
        >
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
        </SummarySection>

        <TextAreaCard
          title="How I work best"
          description="What conditions help you communicate and collaborate well?"
          value={data.how_i_work_best}
          onChange={(value) => setData({ ...data, how_i_work_best: value })}
          placeholder="e.g. I do better with written context before a meeting. I need clear expectations. I work well one-on-one."
        />

        <SummarySection
          title="Workplace triggers and hard moments"
          description="Beckett uses this to be more careful around the moments that tend to spike stress or confusion."
          values={workplaceTriggers}
          editing={editingSections.has("triggers")}
          onToggle={() => toggleSection("triggers")}
        >
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
        </SummarySection>

        <TextAreaCard
          title="My triggers"
          description="What kinds of interactions are hardest for you? What tends to throw you off?"
          value={data.triggers}
          onChange={(value) => setData({ ...data, triggers: value })}
          placeholder="e.g. Being interrupted. Vague feedback. Feeling like I am being judged. Unexpected confrontation."
        />

        <SummarySection
          title="Communication preferences"
          description="Choose how you want Beckett to coach, explain, and draft with you."
          values={[
            ...preferences,
            coachingToneOptions.find((option) => option.value === coachingTone)?.label || "",
          ].filter(Boolean)}
          editing={editingSections.has("preferences")}
          onToggle={() => toggleSection("preferences")}
        >
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
        </SummarySection>

        <TextAreaCard
          title="How I communicate"
          description="How do you naturally communicate? Direct or indirect? Verbose or brief? Comfortable with conflict or avoidant?"
          value={data.communication_style}
          onChange={(value) => setData({ ...data, communication_style: value })}
          placeholder="e.g. I tend to be indirect and avoid conflict. I over-explain when nervous. I need time to process before responding."
        />

        <SummarySection
          title="Neurodivergent context"
          description="Optional. This is never used to diagnose you; it just gives Beckett background context."
          values={[
            ...neurodivergentContext.filter((item) => item !== "Something else"),
            neurodivergentContext.includes("Something else") ? contextOther || "Something else" : "",
          ].filter(Boolean)}
          editing={editingSections.has("context")}
          onToggle={() => toggleSection("context")}
        >
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
        </SummarySection>

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
