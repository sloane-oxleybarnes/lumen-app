"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type AboutData = {
  communication_style: string;
  triggers: string;
  how_i_work_best: string;
};

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
      setLoading(false);
    }
    load();
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
    <div className="max-w-xl">
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
