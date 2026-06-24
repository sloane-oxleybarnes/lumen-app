"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  neurodivergentContextOptions,
  strengthOptions,
  workplaceTriggerOptions,
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
  updated_at?: string;
};

const toolkitCourseTitles: Record<string, string> = {
  "introducing-new-colleague": "Introducing Yourself to a New Colleague",
  "ask-someone-out": "Asking Someone Out on a Dating App",
  "asking-for-clarity": "Asking for Clarity at Work",
};

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

function mergeCustomEntries(list: string[], value: string, max?: number) {
  const next = [...list];
  const existing = new Set(next.map((item) => item.toLowerCase()));

  for (const entry of splitCustomEntries(value)) {
    if (max && next.length >= max) break;
    const key = entry.toLowerCase();
    if (existing.has(key)) continue;
    next.push(entry);
    existing.add(key);
  }

  return next;
}

function toolkitCourseTitle(courseId: string) {
  return toolkitCourseTitles[courseId] || courseId.replace(/-/g, " ");
}

function toolkitCategoryLabel(category: string) {
  return category.replace(/[-_]/g, " ");
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

function CustomEntryControls({
  value,
  onChange,
  onAdd,
  values,
  presetOptions,
  onRemove,
  disabled,
  helperText,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  values: string[];
  presetOptions: string[];
  onRemove: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <div className="mt-4 rounded-sm border border-border bg-bg/60 p-3">
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-light">
        Add your own
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Separate each answer with a comma"
          className="min-w-0 flex-1 rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || splitCustomEntries(value).length === 0}
          className="rounded-pill border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-primary-mid hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {helperText && <p className="mt-2 text-xs text-ink-light">{helperText}</p>}
      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="w-full text-[11px] font-medium uppercase tracking-wide text-ink-light">
            Selected
          </span>
          {values.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRemove(item)}
              className={`rounded-pill px-3 py-1 text-xs transition-colors hover:bg-red-50 hover:text-red-700 ${
                presetOptions.some((option) => option.toLowerCase() === item.toLowerCase())
                  ? "bg-primary-light text-primary"
                  : "bg-white text-ink-mid"
              }`}
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
  const [neurodivergentContext, setNeurodivergentContext] = useState<string[]>([]);
  const [contextOther, setContextOther] = useState("");
  const [customStrengths, setCustomStrengths] = useState("");
  const [customTriggers, setCustomTriggers] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());
  const [toolkitItems, setToolkitItems] = useState<ToolkitItem[]>([]);
  const [deletingToolkitId, setDeletingToolkitId] = useState<string | null>(null);
  const [toolkitFilter, setToolkitFilter] = useState("all");
  const [toolkitSearch, setToolkitSearch] = useState("");
  const [showAllToolkit, setShowAllToolkit] = useState(false);
  const [editingToolkitId, setEditingToolkitId] = useState<string | null>(null);
  const [editingToolkitLabel, setEditingToolkitLabel] = useState("");
  const [editingToolkitContent, setEditingToolkitContent] = useState("");
  const [savingToolkitId, setSavingToolkitId] = useState<string | null>(null);
  const [copiedToolkitId, setCopiedToolkitId] = useState<string | null>(null);

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
        .select("strengths, workplace_triggers, neurodivergent_context, neurodivergent_context_other")
        .eq("id", user.id)
        .single();
      if (profile) {
        setStrengths(profile.strengths || []);
        setWorkplaceTriggers(profile.workplace_triggers || []);
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

  function addCustomStrengths() {
    setStrengths((current) => mergeCustomEntries(current, customStrengths));
    setCustomStrengths("");
  }

  function addCustomTriggers() {
    setWorkplaceTriggers((current) => mergeCustomEntries(current, customTriggers));
    setCustomTriggers("");
  }

  function addCustomContext() {
    setNeurodivergentContext((current) => mergeCustomEntries(current, customContext));
    setCustomContext("");
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

  function startEditingToolkitItem(item: ToolkitItem) {
    setEditingToolkitId(item.id);
    setEditingToolkitLabel(item.label);
    setEditingToolkitContent(item.content);
  }

  function cancelEditingToolkitItem() {
    setEditingToolkitId(null);
    setEditingToolkitLabel("");
    setEditingToolkitContent("");
  }

  async function saveToolkitItem(item: ToolkitItem) {
    if (!editingToolkitLabel.trim() || !editingToolkitContent.trim()) return;
    setSavingToolkitId(item.id);
    const res = await fetch("/api/course-toolkit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        category: item.category,
        label: editingToolkitLabel,
        content: editingToolkitContent,
      }),
    });
    setSavingToolkitId(null);
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { item?: ToolkitItem };
      if (data.item) {
        setToolkitItems((current) => current.map((existing) => existing.id === item.id ? data.item! : existing));
      }
      cancelEditingToolkitItem();
    }
  }

  async function copyToolkitItem(item: ToolkitItem) {
    await navigator.clipboard.writeText(item.content).catch(() => {});
    setCopiedToolkitId(item.id);
    setTimeout(() => setCopiedToolkitId((current) => current === item.id ? null : current), 1500);
  }

  const toolkitFilters = [
    { id: "all", label: "All" },
    ...Array.from(new Set(toolkitItems.map((item) => item.course_id))).map((courseId) => ({
      id: courseId,
      label: toolkitCourseTitles[courseId] || courseId.replace(/-/g, " "),
    })),
  ];
  const normalizedToolkitSearch = toolkitSearch.trim().toLowerCase();
  const filteredToolkitItems = toolkitItems.filter((item) => {
    const matchesCourse = toolkitFilter === "all" || item.course_id === toolkitFilter;
    const matchesSearch = !normalizedToolkitSearch ||
      [item.label, item.content, item.category, toolkitCourseTitle(item.course_id)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedToolkitSearch);
    return matchesCourse && matchesSearch;
  });
  const visibleToolkitItems = showAllToolkit ? filteredToolkitItems : filteredToolkitItems.slice(0, 8);
  const groupedToolkitItems = visibleToolkitItems.reduce<Record<string, ToolkitItem[]>>((groups, item) => {
    const key = item.course_id || "other";
    groups[key] = [...(groups[key] || []), item];
    return groups;
  }, {});

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
        Help Beckett understand how you communicate. This shapes practice sessions,
        message analysis, drafting, Slack coaching, and course feedback.
      </p>

      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Strengths",
              body: "Beckett preserves what already works in your communication instead of coaching around a generic ideal.",
            },
            {
              title: "Triggers",
              body: "Beckett adjusts explanations and suggested wording around moments that can spike stress or ambiguity.",
            },
            {
              title: "Toolkit",
              body: "Saved phrases can be reused or adapted in Practice, Slack, courses, and Draft/Edit support.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-card border border-primary/15 bg-primary-light/35 p-4">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-border rounded-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-ink mb-1">Communication toolkit</h2>
            <p className="text-xs text-ink-light">
              Phrases and questions you created in Beckett courses. Search, edit, copy, or delete anything here.
            </p>
          </div>
          {toolkitItems.length === 0 ? (
            <p className="text-sm text-ink-light">Nothing saved yet. Course phrases will appear here after you build them.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <input
                  value={toolkitSearch}
                  onChange={(e) => {
                    setToolkitSearch(e.target.value);
                    setShowAllToolkit(false);
                  }}
                  placeholder="Search saved phrases"
                  className="w-full rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-ink-light">
                  {filteredToolkitItems.length} saved
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {toolkitFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => {
                      setToolkitFilter(filter.id);
                      setShowAllToolkit(false);
                    }}
                    className={`rounded-pill border px-3 py-1.5 text-xs transition-colors ${
                      toolkitFilter === filter.id
                        ? "border-primary bg-primary-light text-primary"
                        : "border-border bg-bg text-ink-mid hover:border-primary"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {filteredToolkitItems.length === 0 ? (
                <p className="rounded-card border border-dashed border-border bg-bg p-4 text-sm text-ink-light">
                  No saved phrases match that search.
                </p>
              ) : (
                Object.entries(groupedToolkitItems).map(([courseId, items]) => (
                  <div key={courseId} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-border pb-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">
                        {toolkitCourseTitle(courseId)}
                      </p>
                      <span className="text-xs text-ink-light">{items.length}</span>
                    </div>
                    {items.map((item) => {
                      const isEditing = editingToolkitId === item.id;
                      return (
                        <div key={item.id} className="rounded-card border border-border bg-bg p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wide text-ink-light">
                                {toolkitCategoryLabel(item.category)}
                              </p>
                              {isEditing ? (
                                <input
                                  value={editingToolkitLabel}
                                  onChange={(e) => setEditingToolkitLabel(e.target.value)}
                                  className="mt-1 w-full rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                              ) : (
                                <p className="text-sm font-medium text-ink">{item.label}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => copyToolkitItem(item)}
                                className="text-xs text-primary hover:underline"
                              >
                                {copiedToolkitId === item.id ? "Copied" : "Copy"}
                              </button>
                              <button
                                type="button"
                                onClick={() => isEditing ? cancelEditingToolkitItem() : startEditingToolkitItem(item)}
                                className="text-xs text-ink-light hover:text-primary"
                              >
                                {isEditing ? "Cancel" : "Edit"}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteToolkitItem(item.id)}
                                disabled={deletingToolkitId === item.id}
                                className="text-xs text-ink-light hover:text-red-600 disabled:opacity-50"
                              >
                                {deletingToolkitId === item.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                          {isEditing ? (
                            <div className="space-y-3">
                              <textarea
                                value={editingToolkitContent}
                                onChange={(e) => setEditingToolkitContent(e.target.value)}
                                rows={4}
                                className="w-full rounded-sm border border-border bg-white px-3 py-2 text-sm leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                              <button
                                type="button"
                                onClick={() => saveToolkitItem(item)}
                                disabled={savingToolkitId === item.id || !editingToolkitLabel.trim() || !editingToolkitContent.trim()}
                                className="rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingToolkitId === item.id ? "Saving..." : "Save phrase"}
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed text-ink">{item.content}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              {filteredToolkitItems.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllToolkit((current) => !current)}
                  className="rounded-pill border border-primary px-4 py-2 text-xs font-medium text-primary hover:bg-primary-light"
                >
                  {showAllToolkit ? "Show recent" : `View all ${filteredToolkitItems.length}`}
                </button>
              )}
            </div>
          )}
        </div>

        <SummarySection
          title="Communication strengths"
          description="Beckett starts from what already works."
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
                onClick={() => setStrengths((current) => toggleValue(current, option))}
              />
            ))}
          </div>
          <CustomEntryControls
            value={customStrengths}
            onChange={setCustomStrengths}
            onAdd={addCustomStrengths}
            values={strengths}
            presetOptions={strengthOptions}
            onRemove={(value) => setStrengths((current) => current.filter((item) => item !== value))}
          />
        </SummarySection>

        <SummarySection
          title="My Triggers"
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
          <CustomEntryControls
            value={customTriggers}
            onChange={setCustomTriggers}
            onAdd={addCustomTriggers}
            values={workplaceTriggers}
            presetOptions={workplaceTriggerOptions}
            onRemove={(value) => setWorkplaceTriggers((current) => current.filter((item) => item !== value))}
          />
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
          <CustomEntryControls
            value={customContext}
            onChange={setCustomContext}
            onAdd={addCustomContext}
            values={neurodivergentContext.filter((item) => item !== "Something else")}
            presetOptions={neurodivergentContextOptions}
            onRemove={(value) => setNeurodivergentContext((current) => current.filter((item) => item !== value))}
          />
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
