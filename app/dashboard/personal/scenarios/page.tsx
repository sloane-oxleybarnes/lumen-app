import Link from "next/link";
import { personalScenarios } from "@/lib/personal-scenarios";

export default function PersonalScenariosPage() {
  return <div className="max-w-3xl"><h1 className="text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Personal practice scenarios</h1><p className="mt-2 text-sm text-ink-mid">Choose a real-world starting point, then use Beckett to decode or draft in your own voice.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{personalScenarios.map((scenario) => <Link key={scenario.title} href={`/dashboard/personal?pillar=${scenario.pillar}&intent=draft&text=${encodeURIComponent(scenario.prompt)}`} className="rounded-card border border-border bg-white p-4 hover:border-primary-mid"><p className="text-xs font-medium uppercase tracking-wide text-primary">{scenario.skill}</p><h2 className="mt-1 text-base font-medium text-ink">{scenario.title}</h2><p className="mt-2 text-sm text-ink-mid">{scenario.prompt}</p></Link>)}</div></div>;
}
