"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Person = {
  id: string;
  name: string;
  relationship: string;
  communication_style: string;
  notes: string;
};

const empty = (): Omit<Person, "id"> => ({
  name: "",
  relationship: "",
  communication_style: "",
  notes: "",
});

export default function TrustedPeoplePage() {
  const supabase = createClient();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  async function loadPeople() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("trusted_people")
      .select("id, name, relationship, communication_style, notes")
      .eq("user_id", user.id)
      .order("created_at");
    setPeople((data as Person[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadPeople(); }, []);

  function openAdd() {
    setForm(empty());
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(p: Person) {
    setForm({ name: p.name, relationship: p.relationship, communication_style: p.communication_style, notes: p.notes });
    setEditingId(p.id);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    if (editingId) {
      await supabase.from("trusted_people").update(form).eq("id", editingId);
    } else {
      await supabase.from("trusted_people").insert({ ...form, user_id: user.id });
    }

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(empty());
    loadPeople();
  }

  async function deletePerson(id: string) {
    if (!window.confirm("Remove this person?")) return;
    await supabase.from("trusted_people").delete().eq("id", id);
    setPeople((prev) => prev.filter((p) => p.id !== id));
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
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1
            className="text-3xl text-ink"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Trusted People
          </h1>
          <p className="text-ink-mid text-sm mt-1">
            People you practice conversations with. Their communication style
            is used to make practice more realistic.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 bg-primary text-white text-sm rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors mt-1"
        >
          + Add person
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-white border border-border rounded-card p-5 mt-6 mb-4">
          <h2 className="text-base font-medium text-ink mb-4">
            {editingId ? "Edit person" : "Add a person"}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alex, my manager"
                required
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Relationship
              </label>
              <input
                type="text"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                placeholder="e.g. Manager, close friend, partner"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Communication style
              </label>
              <textarea
                value={form.communication_style}
                onChange={(e) => setForm({ ...form, communication_style: e.target.value })}
                placeholder="e.g. Direct and blunt. Doesn't like small talk. Responds well to data and specifics. Gets defensive when feels criticised."
                rows={3}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Currently stressed about the Q3 roadmap. History of dismissing my ideas in group settings."
                rows={2}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add person"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(empty()); }}
                className="border border-border text-sm rounded-pill px-5 py-2 text-ink-mid hover:bg-bg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* People list */}
      {people.length === 0 && !showForm ? (
        <div className="mt-8 text-center py-12 bg-white border border-border rounded-card">
          <p className="text-ink-mid text-sm">No one added yet.</p>
          <p className="text-ink-light text-xs mt-1">
            Add someone to make practice sessions more realistic.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {people.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-border rounded-card p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{p.name}</p>
                {p.relationship && (
                  <p className="text-xs text-ink-light">{p.relationship}</p>
                )}
                {p.communication_style && (
                  <p className="text-xs text-ink-mid mt-1 leading-relaxed line-clamp-2">
                    {p.communication_style}
                  </p>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs text-ink-mid hover:text-ink transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => deletePerson(p.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
