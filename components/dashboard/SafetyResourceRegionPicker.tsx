"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeSafetyResourceRegion,
  safetyResourceRegions,
  type SafetyResourceRegion,
} from "@/lib/safety-resources";

export default function SafetyResourceRegionPicker({ initialRegion }: { initialRegion: string | null | undefined }) {
  const router = useRouter();
  const [region, setRegion] = useState<SafetyResourceRegion>(normalizeSafetyResourceRegion(initialRegion));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const response = await fetch("/api/safety/resource-region", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region }),
      });
      if (!response.ok) throw new Error();
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mb-5 rounded-card border border-primary/20 bg-primary-light/40 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">Your resource region</p>
      <h2 className="mt-1 text-xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>Choose the country or region you want Beckett to use</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-mid">This is a preference you choose—Beckett does not infer your location. It is used only to select safety-resource information when a reviewed regional set is available.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm font-medium text-ink">Country or region
          <select value={region} onChange={(event) => { setRegion(normalizeSafetyResourceRegion(event.target.value)); setStatus("idle"); }} className="mt-1 block w-full rounded-sm border border-border bg-white px-3 py-2 text-sm font-normal text-ink">
            {safetyResourceRegions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void save()} disabled={status === "saving"} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60">{status === "saving" ? "Saving…" : "Save region"}</button>
      </div>
      {status === "saved" && <p className="mt-3 text-xs font-medium text-primary">Saved. The resource list below has been refreshed.</p>}
      {status === "error" && <p className="mt-3 text-xs font-medium text-red-700">Your region could not be saved. Please try again.</p>}
    </section>
  );
}
