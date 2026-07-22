"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

type Action = "decode" | "draft";
type Safety = { title: string; message: string; resources: Array<{ label: string; href: string }> };

export default function CoachPage() {
  const searchParams = useSearchParams();
  const [action, setAction] = useState<Action>(() => searchParams.get("desktop_action") === "draft" ? "draft" : "decode");
  const [text, setText] = useState(() => searchParams.get("text") || "");
  const [warmth, setWarmth] = useState("warm");
  const [directness, setDirectness] = useState("balanced");
  const [formality, setFormality] = useState("natural");
  const [length, setLength] = useState("concise");
  const [response, setResponse] = useState<string | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null); setResponse(null); setSafety(null);
    try {
      const result = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, text, warmth, directness, formality, length }) });
      const data = await result.json().catch(() => null) as { response?: string; safety?: Safety; error?: string } | null;
      if (!result.ok) throw new Error(data?.error || "Beckett could not prepare coaching.");
      if (data?.safety) setSafety(data.safety); else setResponse(data?.response || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Beckett could not prepare coaching."); }
    finally { setLoading(false); }
  }

  return <div className="max-w-3xl"><h1 className="text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Communication workspace</h1><p className="mt-2 text-sm text-ink-mid">Decode a message, draft a response, or practice a conversation. You stay in control of what you send.</p><div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => setAction("decode")} className={`rounded-pill px-4 py-2 text-sm font-medium ${action === "decode" ? "bg-primary text-white" : "border border-border text-ink-mid hover:bg-bg"}`}>Decode</button><button type="button" onClick={() => setAction("draft")} className={`rounded-pill px-4 py-2 text-sm font-medium ${action === "draft" ? "bg-primary text-white" : "border border-border text-ink-mid hover:bg-bg"}`}>Draft</button><Link href="/dashboard/practice" className="rounded-pill border border-border px-4 py-2 text-sm font-medium text-ink-mid hover:bg-bg">Practice →</Link></div><form onSubmit={submit} className="mt-5 rounded-card border border-border bg-white p-6"><label className="block text-sm font-medium text-ink">{action === "decode" ? "Message or situation to understand" : "What do you want to communicate?"}<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={5000} rows={8} placeholder={action === "decode" ? "Paste a message or describe what happened." : "Describe the context and what you want to say."} className="mt-2 block w-full rounded-sm border border-border px-3 py-2 text-sm font-normal leading-relaxed" /></label><div className="mt-5 grid gap-3 sm:grid-cols-2"> <Select label="Directness" value={directness} values={["gentle", "balanced", "direct"]} onChange={setDirectness} /><Select label="Warmth" value={warmth} values={["neutral", "warm", "very warm"]} onChange={setWarmth} /><Select label="Formality" value={formality} values={["casual", "natural", "formal"]} onChange={setFormality} /><Select label="Length" value={length} values={["brief", "concise", "detailed"]} onChange={setLength} /></div><button disabled={loading || !text.trim()} className="mt-5 rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">{loading ? "Thinking…" : action === "decode" ? "Decode this" : "Draft options"}</button></form>{error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}{safety && <section className="mt-5 rounded-card border border-amber-200 bg-amber-50 p-5"><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{safety.title}</h2><p className="mt-2 text-sm leading-relaxed text-ink-mid">{safety.message}</p><div className="mt-3 flex flex-col gap-2">{safety.resources.map((resource) => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">{resource.label} ↗</a>)}</div></section>}{response && <section className="mt-5 rounded-card border border-border bg-white p-6"><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Beckett&apos;s coaching</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{response}</p></section>}</div>;
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label className="text-sm font-medium text-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-sm border border-border bg-white px-3 py-2 text-sm font-normal">{values.map((option) => <option key={option}>{option}</option>)}</select></label>; }
