import SafetyResourceRegionPicker from "@/components/dashboard/SafetyResourceRegionPicker";
import { allSafetyResources, getSafetyResourceRegionNotice, normalizeSafetyResourceRegion } from "@/lib/safety-resources";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function SafetyPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("safety_resource_region").eq("id", user.id).maybeSingle()
    : { data: null };
  const region = normalizeSafetyResourceRegion(profile?.safety_resource_region);
  const resources = allSafetyResources(region);
  return <div className="max-w-3xl"><h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Support boundaries & resources</h1><p className="mb-7 text-sm text-ink-mid">Beckett is a communication coach. It cannot replace urgent, legal, medical, mental-health, or relationship-safety support.</p><SafetyResourceRegionPicker initialRegion={profile?.safety_resource_region} /><div className="mb-5 rounded-sm border border-primary/15 bg-primary-light/40 p-4 text-sm leading-relaxed text-ink-mid">{getSafetyResourceRegionNotice(region)}</div><div className="space-y-4">{resources.map((group) => <section key={group.topic} className="rounded-card border border-border bg-white p-5"><h2 className="text-lg text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{group.title}</h2><p className="mt-2 text-sm leading-relaxed text-ink-mid">{group.message}</p><div className="mt-4 flex flex-col gap-2">{group.resources.map((resource) => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">{resource.label} ↗</a>)}</div><p className="mt-4 text-xs text-ink-light">{group.usingUSFallback ? "U.S.-first fallback" : "U.S.-first resource set"} · Last reviewed {group.reviewedAt} · Next review {group.nextReviewAt} · Reviewed every {group.reviewCadenceDays} days · Owner: {group.owner}</p></section>)}</div><p className="mt-6 text-xs leading-relaxed text-ink-light">Resource availability and applicability vary by location. If there is immediate danger, contact local emergency services.</p></div>;
}
