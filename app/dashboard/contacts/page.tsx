"use client";

import { useEffect, useState, useCallback } from "react";

type ContactIdentifier = {
  id?: string;
  platform: string;
  identifier: string;
  label: string | null;
  confirmed: boolean | null;
};

type RelationshipSummary = {
  communication_style: string | null;
  recurring_tension_points: string | null;
  what_tends_to_work: string | null;
  unresolved_topics: string | null;
  generated_from: string | null;
  updated_at: string | null;
};

type Contact = {
  id: string;
  name: string;
  email: string | null;
  slack_handle: string | null;
  phone_number: string | null;
  relationship_type: string | null;
  relationship_other: string | null;
  notes: string | null;
  trusted: boolean;
  created_at: string;
  contact_identifiers?: ContactIdentifier[];
  contact_insights?: ContactInsights | null;
  contact_relationship_summaries?: RelationshipSummary | RelationshipSummary[] | null;
};

type ContactInsights = {
  summary: string | null;
  communication_patterns: string | null;
  common_topics: string | null;
  tone_trend: string | null;
  responsiveness: string | null;
  generated_at: string | null;
};

const emptyForm = () => ({
  name: "",
  email: "",
  slack_handle: "",
  phone_number: "",
  identifiers: [] as ContactIdentifier[],
  relationship_type: "",
  relationship_other: "",
  notes: "",
  trusted: false,
});

const relationshipOptions = [
  "Manager",
  "Direct report",
  "Teammate",
  "Cross-functional colleague",
  "Client/customer",
  "Vendor/partner",
  "Friend at work",
  "Other",
];

function relationshipLabel(contact: Pick<Contact, "relationship_type" | "relationship_other">) {
  if (contact.relationship_type === "Other") return contact.relationship_other || "Other";
  return contact.relationship_type || "";
}

const additionalIdentifierOptions = [
  { value: "work_email", label: "Work email" },
  { value: "personal_email", label: "Personal email" },
  { value: "mobile", label: "Mobile" },
  { value: "slack_user_id", label: "Confirmed Slack user ID" },
];

function normalizeContactFromApi(contact: Contact): Contact {
  const rawInsights = contact.contact_insights as ContactInsights | ContactInsights[] | null | undefined;
  const insights = Array.isArray(rawInsights)
    ? rawInsights[0] || null
    : rawInsights || null;
  const relationshipSummary = Array.isArray(contact.contact_relationship_summaries)
    ? contact.contact_relationship_summaries[0] || null
    : contact.contact_relationship_summaries || null;

  return {
    ...contact,
    contact_identifiers: contact.contact_identifiers || [],
    contact_insights: insights,
    contact_relationship_summaries: relationshipSummary,
  };
}

function identifierLabel(identifier: ContactIdentifier) {
  if (identifier.label) return identifier.label;
  const found = additionalIdentifierOptions.find((option) => option.value === identifier.platform);
  if (found) return found.label;
  if (identifier.platform === "email") return "Email";
  if (identifier.platform === "slack") return "Slack display";
  if (identifier.platform === "phone") return "Phone";
  return identifier.platform.replace(/_/g, " ");
}

function isLegacyIdentifier(identifier: ContactIdentifier) {
  return identifier.platform === "email" || identifier.platform === "slack" || identifier.platform === "phone";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/contacts");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json() as { contacts?: Contact[] };
    setContacts((data.contacts || []).map(normalizeContactFromApi));
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const relationship = relationshipLabel(c).toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.slack_handle?.toLowerCase().includes(q) ||
      c.phone_number?.toLowerCase().includes(q) ||
      c.contact_identifiers?.some((identifier) =>
        `${identifier.platform} ${identifier.identifier} ${identifier.label || ""}`.toLowerCase().includes(q)
      ) ||
      relationship.includes(q)
    );
  });
  const selectedContact = selectedId
    ? contacts.find((contact) => contact.id === selectedId) || null
    : null;
  const selectedRelationshipSummary = selectedContact
    ? (Array.isArray(selectedContact.contact_relationship_summaries)
        ? selectedContact.contact_relationship_summaries[0] || null
        : selectedContact.contact_relationship_summaries || null)
    : null;

  function openAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
    setSelectedId(null);
  }

  function openEdit(c: Contact) {
    setForm({
      name: c.name,
      email: c.email || "",
      slack_handle: c.slack_handle || "",
      phone_number: c.phone_number || "",
      identifiers: (c.contact_identifiers || [])
        .filter((identifier) => !isLegacyIdentifier(identifier))
        .map((identifier) => ({
          platform: identifier.platform,
          identifier: identifier.identifier,
          label: identifier.label,
          confirmed: identifier.confirmed,
        })),
      relationship_type: c.relationship_type || "",
      relationship_other: c.relationship_other || "",
      notes: c.notes || "",
      trusted: c.trusted,
    });
    setEditingId(c.id);
    setShowForm(true);
    setSelectedId(null);
  }

  function addIdentifier() {
    setForm((current) => ({
      ...current,
      identifiers: [
        ...current.identifiers,
        { platform: "work_email", identifier: "", label: null, confirmed: true },
      ],
    }));
  }

  function updateIdentifier(index: number, patch: Partial<ContactIdentifier>) {
    setForm((current) => ({
      ...current,
      identifiers: current.identifiers.map((identifier, i) =>
        i === index
          ? {
              ...identifier,
              ...patch,
              confirmed: patch.platform === "slack_user_id" ? true : patch.confirmed ?? identifier.confirmed ?? true,
            }
          : identifier
      ),
    }));
  }

  function removeIdentifier(index: number) {
    setForm((current) => ({
      ...current,
      identifiers: current.identifiers.filter((_, i) => i !== index),
    }));
  }

  function openMerge(c: Contact) {
    const firstOtherContact = contacts.find((contact) => contact.id !== c.id);
    setMergeSourceId(c.id);
    setMergeTargetId(firstOtherContact?.id || "");
    setMergeError("");
    setShowForm(false);
    setEditingId(null);
  }

  async function mergeContact(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;

    const source = contacts.find((contact) => contact.id === mergeSourceId);
    const target = contacts.find((contact) => contact.id === mergeTargetId);
    if (!source || !target) return;

    const confirmed = window.confirm(
      `Merge ${source.name} into ${target.name}? ${target.name} will stay, identifiers and missing details from ${source.name} will move over, and ${source.name} will be removed.`
    );
    if (!confirmed) return;

    setMerging(true);
    setMergeError("");

    const res = await fetch("/api/contacts/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryContactId: mergeTargetId,
        duplicateContactId: mergeSourceId,
      }),
    });
    const data = await res.json() as { error?: string };

    setMerging(false);

    if (!res.ok) {
      setMergeError(data.error || "Could not merge contacts.");
      return;
    }

    setMergeSourceId(null);
    setMergeTargetId("");
    setSelectedId(mergeTargetId);
    await loadContacts();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      slack_handle: form.slack_handle.trim() || null,
      phone_number: form.phone_number.trim() || null,
      identifiers: form.identifiers
        .map((identifier) => ({
          platform: identifier.platform,
          identifier: identifier.identifier.trim(),
          label: identifierLabel(identifier),
          confirmed: identifier.platform !== "slack",
        }))
        .filter((identifier) => identifier.identifier),
      relationship_type: form.relationship_type || null,
      relationship_other: form.relationship_type === "Other" ? form.relationship_other.trim() || null : null,
      notes: form.notes.trim() || null,
      trusted: form.trusted,
    };

    const url = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    loadContacts();
  }

  async function toggleTrusted(c: Contact) {
    await fetch(`/api/contacts/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trusted: !c.trusted }),
    });
    setContacts((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, trusted: !c.trusted } : x))
    );
  }

  async function deleteContact(id: string) {
    if (!window.confirm("Remove this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  async function refreshInsights(id: string) {
    setGeneratingInsights(true);
    const res = await fetch(`/api/contacts/${id}/insights`, { method: "POST" });
    const data = await res.json() as { insights?: ContactInsights; relationshipSummary?: RelationshipSummary };
    if (data.insights) {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                contact_insights: data.insights,
                contact_relationship_summaries: data.relationshipSummary || c.contact_relationship_summaries || null,
              }
            : c
        )
      );
    }
    setGeneratingInsights(false);
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center" role="status" aria-live="polite">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading contacts</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-3xl text-ink"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Contacts
          </h1>
          <p className="text-ink-mid text-sm mt-1">
            People Beckett can recognize across connected tools. Identifiers are optional, but they help Beckett use the right relationship context.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 bg-primary text-white text-sm rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors mt-1"
        >
          + Add contact
        </button>
      </div>

      {/* Search */}
      {contacts.length > 0 && (
        <div className="mb-5">
          <label htmlFor="contact-search" className="sr-only">
            Search contacts by name, email, Slack handle, phone, identifier, or relationship
          </label>
          <input
            id="contact-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, Slack, phone, or identifier..."
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-white border border-border rounded-card p-5 mb-5">
          <h2 className="text-base font-medium text-ink mb-4">
            {editingId ? "Edit contact" : "Add a contact"}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Slack handle</label>
                <input
                  type="text"
                  value={form.slack_handle}
                  onChange={(e) => setForm({ ...form, slack_handle: e.target.value })}
                  placeholder="@handle or display name"
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Relationship</label>
                <select
                  value={form.relationship_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      relationship_type: e.target.value,
                      relationship_other: e.target.value === "Other" ? form.relationship_other : "",
                    })
                  }
                  className="w-full border border-border rounded-sm bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Choose relationship</option>
                  {relationshipOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {form.relationship_type === "Other" && (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Other relationship</label>
                  <input
                    type="text"
                    value={form.relationship_other}
                    onChange={(e) => setForm({ ...form, relationship_other: e.target.value })}
                    placeholder="e.g. mentor, agency partner"
                    className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>
            <div className="rounded-sm border border-border bg-bg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-ink">Additional identifiers</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-light">
                    Email, Slack, and phone are optional. Confirmed Slack IDs connect to the actual Slack person; display names are only suggestions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addIdentifier}
                  className="shrink-0 border border-border text-xs rounded-pill px-3 py-1.5 text-ink-mid hover:bg-white transition-colors"
                >
                  + Add
                </button>
              </div>
              {form.identifiers.length > 0 && (
                <div className="mt-4 space-y-3">
                  {form.identifiers.map((identifier, index) => (
                    <div key={index} className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
                      <select
                        value={identifier.platform}
                        onChange={(e) => updateIdentifier(index, { platform: e.target.value })}
                        className="w-full border border-border rounded-sm bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {additionalIdentifierOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={identifier.identifier}
                        onChange={(e) => updateIdentifier(index, { identifier: e.target.value })}
                        placeholder={identifier.platform === "slack_user_id" ? "T123456:U123456" : "Identifier"}
                        className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeIdentifier(index)}
                        className="border border-border text-xs rounded-pill px-3 py-2 text-ink-mid hover:bg-white transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Context, communication style, relationship notes…"
                rows={3}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.trusted}
                onChange={(e) => setForm({ ...form, trusted: e.target.checked })}
                className="rounded border-border text-primary"
              />
              <span className="text-sm text-ink">Trusted contact — warmer tone automatically</span>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add contact"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()); }}
                className="border border-border text-sm rounded-pill px-5 py-2 text-ink-mid hover:bg-bg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {mergeSourceId && (
        <div className="bg-white border border-border rounded-card p-5 mb-5">
          <h2 className="text-base font-medium text-ink mb-2">Merge contacts</h2>
          <p className="text-sm text-ink-mid mb-4">
            Choose the contact to keep. Beckett will move identifiers and missing details from the duplicate, then remove the duplicate contact.
          </p>
          <form onSubmit={mergeContact} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Duplicate to merge</label>
                <div className="rounded-sm border border-border bg-bg px-3 py-2 text-sm text-ink">
                  {contacts.find((contact) => contact.id === mergeSourceId)?.name || "Selected contact"}
                </div>
              </div>
              <div>
                <label htmlFor="merge-target" className="block text-sm font-medium text-ink mb-1">
                  Keep this contact
                </label>
                <select
                  id="merge-target"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  required
                  className="w-full border border-border rounded-sm bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Choose contact to keep</option>
                  {contacts
                    .filter((contact) => contact.id !== mergeSourceId)
                    .map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.email ? ` · ${contact.email}` : ""}
                        {contact.slack_handle ? ` · Slack: ${contact.slack_handle}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {mergeError && (
              <p className="text-sm text-red-600" role="alert">{mergeError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={merging || !mergeTargetId}
                className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {merging ? "Merging…" : "Merge contacts"}
              </button>
              <button
                type="button"
                onClick={() => { setMergeSourceId(null); setMergeTargetId(""); setMergeError(""); }}
                className="border border-border text-sm rounded-pill px-5 py-2 text-ink-mid hover:bg-bg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedContact && !showForm && !mergeSourceId ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-sm text-primary transition-colors hover:underline"
          >
            ← Back to contacts
          </button>

          <section className="relative bg-white border border-border rounded-card p-6">
            <button
              onClick={() => toggleTrusted(selectedContact)}
              className={`absolute right-5 top-5 text-2xl leading-none transition-colors ${
                selectedContact.trusted ? "text-primary" : "text-ink-light hover:text-primary"
              }`}
              title={selectedContact.trusted ? "Remove trusted" : "Mark trusted"}
              aria-label={selectedContact.trusted ? `Remove ${selectedContact.name} from trusted contacts` : `Mark ${selectedContact.name} as trusted`}
            >
              <span aria-hidden="true">{selectedContact.trusted ? "♥" : "♡"}</span>
            </button>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 pr-10">
                <h2
                  className="text-3xl text-ink"
                  style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
                >
                  {selectedContact.name}
                </h2>
                {relationshipLabel(selectedContact) && (
                  <p className="mt-1 text-sm text-primary">{relationshipLabel(selectedContact)}</p>
                )}
                <p className="mt-2 text-sm text-ink-light">
                  Added {new Date(selectedContact.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openEdit(selectedContact)}
                  className="border border-border text-sm rounded-pill px-4 py-2 text-ink-mid hover:bg-bg transition-colors"
                >
                  Edit
                </button>
                {contacts.length > 1 && (
                  <button
                    onClick={() => openMerge(selectedContact)}
                    className="border border-border text-sm rounded-pill px-4 py-2 text-ink-mid hover:bg-bg transition-colors"
                  >
                    Merge
                  </button>
                )}
                <button
                  onClick={() => deleteContact(selectedContact.id)}
                  className="border border-red-200 text-sm rounded-pill px-4 py-2 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-card border border-border bg-bg p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">Email</p>
                <p className="break-words text-sm text-ink">{selectedContact.email || "Not added"}</p>
              </div>
              <div className="rounded-card border border-border bg-bg p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">Slack</p>
                <p className="break-words text-sm text-ink">{selectedContact.slack_handle || "Not added"}</p>
              </div>
              <div className="rounded-card border border-border bg-bg p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">Phone</p>
                <p className="break-words text-sm text-ink">{selectedContact.phone_number || "Not added"}</p>
              </div>
            </div>

            <div className="mt-5 rounded-card border border-border bg-bg p-4">
              <div className="mb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Identifiers</p>
                <p className="mt-1 text-xs text-ink-light">
                  Confirmed identifiers can connect real Gmail, Slack, or phone context. Slack display names remain suggestions.
                </p>
              </div>
              {selectedContact.contact_identifiers?.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedContact.contact_identifiers.map((identifier) => (
                    <span
                      key={`${identifier.platform}:${identifier.identifier}`}
                      className={`max-w-full truncate rounded px-2 py-1 text-xs ${
                        identifier.confirmed ? "bg-white text-ink" : "bg-white text-ink-light"
                      }`}
                      title={`${identifierLabel(identifier)}: ${identifier.identifier}`}
                    >
                      {identifierLabel(identifier)}: {identifier.identifier}
                      {identifier.confirmed ? " · confirmed" : " · suggestion"}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-light">No identifiers added yet.</p>
              )}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="bg-white border border-border rounded-card p-5">
              <h3 className="text-base font-medium text-ink mb-3">Notes</h3>
              {selectedContact.notes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-mid">{selectedContact.notes}</p>
              ) : (
                <p className="text-sm text-ink-light">No notes yet.</p>
              )}
            </div>

            <div className="bg-white border border-border rounded-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium text-ink">Relationship insights</h3>
                  <p className="mt-1 text-xs text-ink-light">
                    Summary-level context Beckett can use for coaching. Raw Gmail and Slack history is not stored here.
                  </p>
                </div>
                <button
                  onClick={() => refreshInsights(selectedContact.id)}
                  disabled={generatingInsights}
                  className="shrink-0 text-xs text-primary hover:underline disabled:opacity-50"
                  aria-label={`${selectedContact.contact_insights ? "Refresh" : "Generate"} relationship insights for ${selectedContact.name}`}
                >
                  {generatingInsights ? "Generating…" : selectedContact.contact_insights ? "Refresh" : "Generate"}
                </button>
              </div>

              {selectedRelationshipSummary || selectedContact.contact_insights ? (
                <div className="space-y-4">
                  {selectedRelationshipSummary && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { label: "Communication style", value: selectedRelationshipSummary.communication_style },
                        { label: "Common friction", value: selectedRelationshipSummary.recurring_tension_points },
                        { label: "Preferred approach", value: selectedRelationshipSummary.what_tends_to_work },
                        { label: "Unresolved topics", value: selectedRelationshipSummary.unresolved_topics },
                      ].map(({ label, value }) => {
                        if (!value) return null;
                        return (
                          <div key={label} className="rounded-card border border-border bg-bg p-4">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p>
                            <p className="text-sm leading-relaxed text-ink-mid">{value}</p>
                          </div>
                        );
                      })}
                      {selectedRelationshipSummary.updated_at && (
                        <p className="text-xs text-ink-light md:col-span-2">
                          Summary updated {new Date(selectedRelationshipSummary.updated_at).toLocaleDateString()}
                          {selectedRelationshipSummary.generated_from ? ` from ${selectedRelationshipSummary.generated_from}` : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedContact.contact_insights && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { label: "Summary", key: "summary" },
                        { label: "Communication", key: "communication_patterns" },
                        { label: "Common topics", key: "common_topics" },
                        { label: "Tone trend", key: "tone_trend" },
                        { label: "Responsiveness", key: "responsiveness" },
                      ].map(({ label, key }) => {
                        const val = selectedContact.contact_insights![key as keyof ContactInsights];
                        if (!val) return null;
                        return (
                          <div key={key} className="rounded-card border border-border bg-bg p-4">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p>
                            <p className="text-sm leading-relaxed text-ink-mid">{val}</p>
                          </div>
                        );
                      })}
                      {selectedContact.contact_insights.generated_at && (
                        <p className="text-xs text-ink-light md:col-span-2">
                          Insights updated {new Date(selectedContact.contact_insights.generated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-light">
                  No insights yet. Click Generate to analyze this relationship.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : filtered.length === 0 && !showForm ? (
        <div className="mt-6 text-center py-16 bg-white border border-border rounded-card">
          <p className="text-ink-mid text-sm">
            {search ? "No contacts match your search." : "No contacts yet."}
          </p>
          {!search && (
            <p className="text-ink-light text-xs mt-1">
              Add someone to start tracking your relationship context.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((c) => {
            return (
              <div
                key={c.id}
                className="bg-white border border-border rounded-card p-4 transition-colors hover:border-ink-light"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                    </div>
                    {relationshipLabel(c) && (
                      <p className="mt-1 text-xs text-primary">{relationshipLabel(c)}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.email && (
                        <span className="max-w-full truncate rounded bg-bg px-2 py-0.5 text-xs text-ink-light">
                          {c.email}
                        </span>
                      )}
                      {c.slack_handle && (
                        <span className="max-w-full truncate rounded bg-bg px-2 py-0.5 text-xs text-ink-light">
                          Slack: {c.slack_handle}
                        </span>
                      )}
                      {c.contact_identifiers?.some((identifier) => identifier.platform === "slack_user_id") && (
                        <span className="max-w-full truncate rounded bg-bg px-2 py-0.5 text-xs text-ink-light">
                          Slack confirmed
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTrusted(c); }}
                    className={`shrink-0 text-xl leading-none transition-colors ${
                      c.trusted ? "text-primary" : "text-ink-light hover:text-primary"
                    }`}
                    title={c.trusted ? "Remove trusted" : "Mark trusted"}
                    aria-label={c.trusted ? `Remove ${c.name} from trusted contacts` : `Mark ${c.name} as trusted`}
                  >
                    <span aria-hidden="true">{c.trusted ? "♥" : "♡"}</span>
                  </button>
                </div>

                <div className="mt-4 flex gap-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setSelectedId(c.id); setShowForm(false); setMergeSourceId(null); }}
                    className="text-xs text-primary transition-colors hover:underline"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="text-xs text-ink-mid transition-colors hover:text-ink"
                  >
                    Edit
                  </button>
                  {contacts.length > 1 && (
                    <button
                      onClick={() => openMerge(c)}
                      className="text-xs text-ink-mid transition-colors hover:text-ink"
                    >
                      Merge
                    </button>
                  )}
                  <button
                    onClick={() => deleteContact(c.id)}
                    className="text-xs text-red-400 transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
