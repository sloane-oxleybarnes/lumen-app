"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function UpgradeModal({
  userEmail,
  onClose,
}: {
  userEmail: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [done, setDone] = useState(false);

  async function handleIntent() {
    await supabase.from("upgrade_intents").insert({
      email: userEmail,
      target_plan: "pro",
    });

    fetch("/api/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_deal",
        deal: {
          dealName: `${userEmail} — Pro intent`,
          amount: 12,
          stage: "appointmentscheduled",
          plan: "pro",
        },
      }),
    }).catch(() => {});

    fetch("/api/loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "trigger_event",
        email: userEmail,
        eventName: "upgrade_intent",
      }),
    }).catch(() => {});

    setDone(true);
  }

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card border border-border p-8 max-w-md w-full shadow-xl">
        {done ? (
          <div className="text-center">
            <div className="text-3xl mb-4">🎉</div>
            <h2
              className="text-2xl text-ink mb-2"
              style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
            >
              You&apos;re on the list
            </h2>
            <p className="text-ink-mid text-sm mb-6">
              We&apos;ll email you as soon as billing is ready. In the meantime,
              join the beta for full Pro access, free.
            </p>
            <button
              onClick={onClose}
              className="bg-primary text-white rounded-pill px-6 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2
              className="text-2xl text-ink mb-2"
              style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
            >
              Pro is coming soon
            </h2>
            <p className="text-ink-mid text-sm mb-6">
              We&apos;re finalising billing. Join the waitlist and we&apos;ll
              email you the moment it&apos;s ready — with a launch discount.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleIntent}
                className="flex-1 bg-primary text-white rounded-pill py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                Join the waitlist
              </button>
              <button
                onClick={onClose}
                className="text-ink-light text-sm hover:text-ink transition-colors px-3"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
