"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const split = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
type Contact = { name: string; email?: string | null; relationship_tags?: string[] | null; notes?: string | null };

export default function MeetingPrepPanel() {
  const searchParams = useSearchParams();
  const [title, setTitle] = useState(() => searchParams.get("title") || "");
  const [goals, setGoals] = useState("");
  const [attendees, setAttendees] = useState(() => searchParams.get("attendees") || "");
  const [reminders, setReminders] = useState("");
  const [checklist, setChecklist] = useState("Review the agenda\nChoose one clear outcome\nLeave room for questions");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void (async () => { const response = await fetch("/api/contacts"); const data = await response.json().catch(() => null) as { contacts?: Contact[] } | null; if (response.ok) setContacts(data?.contacts || []); })(); }, []);
  const matchedContacts = useMemo(() => contacts.filter((contact) => attendees.toLowerCase().includes(contact.name.toLowerCase()) || Boolean(contact.email && attendees.toLowerCase().includes(contact.email.toLowerCase()))), [attendees, contacts]);
  function addContactContext() { const context = matchedContacts.map((contact) => `${contact.name}${contact.relationship_tags?.length ? ` (${contact.relationship_tags.join(", ")})` : ""}${contact.notes ? `: ${contact.notes}` : ""}`).join("\n"); setAttendees((current) => current.includes(context) ? current : `${current}${current ? "\n\n" : ""}Saved relationship context:\n${context}`); }
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setMessage(null); try { const created = await fetch("/api/meetings/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, source: "calendar" }) }); const initial = await created.json() as { session?: { id: string }; error?: string }; if (!created.ok || !initial.session) throw new Error(initial.error || "Could not start meeting preparation."); const updated = await fetch(`/api/meetings/sessions/${initial.session.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_notes: "", final_summary: "", follow_up_draft: "", decisions: [], open_questions: [], pre_meeting_goals: split(goals), attendee_context: attendees, communication_reminders: reminders, prep_checklist: split(checklist) }) }); if (!updated.ok) throw new Error("Could not save meeting preparation."); setMessage("Meeting preparation saved. Open Meeting Companion after the call for notes and follow-up."); setTitle(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save meeting preparation."); } finally { setSaving(false); } }

  return <div className="max-w-3xl"><h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Prepare for a meeting</h1><p className="mb-7 text-sm text-ink-mid">Set an outcome and a few helpful reminders before you join. Nothing is sent or added to your calendar.</p><form onSubmit={save} className="rounded-card border border-border bg-white p-6"><Field label="Meeting title" value={title} onChange={setTitle} placeholder="Weekly project check-in" /><Area label="What do you want to accomplish? (one goal per line)" value={goals} onChange={setGoals} /><Area label="Attendee and relationship context" value={attendees} onChange={setAttendees} placeholder="Who is attending and anything useful to remember." />{matchedContacts.length > 0 && <div className="mt-3 rounded-sm border border-primary/20 bg-primary-light/40 p-3"><p className="text-xs text-ink-mid">Saved context available for {matchedContacts.map((contact) => contact.name).join(", ")}.</p><button type="button" onClick={addContactContext} className="mt-2 text-xs font-medium text-primary hover:underline">Add saved relationship context</button></div>}<Area label="Communication reminders" value={reminders} onChange={setReminders} placeholder="For example: Ask for written next steps; pause before agreeing to a new deadline." /><Area label="Preparation checklist (one item per line)" value={checklist} onChange={setChecklist} /><button disabled={saving || !title.trim()} className="mt-5 rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving…" : "Save meeting preparation"}</button>{message && <p className="mt-3 text-sm text-ink-mid">{message}</p>}</form></div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block text-sm font-medium text-ink">{label}<input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-sm font-normal" /></label>; }
function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="mt-4 block text-sm font-medium text-ink">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-sm font-normal" /></label>; }
