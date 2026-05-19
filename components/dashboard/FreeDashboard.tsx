"use client";

import { useState } from "react";
import UpgradeModal from "./UpgradeModal";

const gettingStarted = [
  {
    label: "Add Beckett to Chrome",
    done: false,
    href: "https://chrome.google.com/webstore",
    proOnly: false,
  },
  { label: "Connect Gmail", done: false, href: "#", proOnly: false },
  { label: "Connect Slack", done: false, href: "#", proOnly: false },
  { label: "Connect LinkedIn", done: false, href: "#", proOnly: true },
  { label: "Enable meeting guidance", done: false, href: "#", proOnly: true },
];

export default function FreeDashboard({
  name,
  userEmail,
}: {
  name: string;
  userEmail: string;
}) {
  const [betaCode, setBetaCode] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [betaStatus, setBetaStatus] = useState<"idle" | "success" | "error">("idle");

  function handleBetaActivate() {
    // TODO: validate against Supabase when beta codes table is built
    if (betaCode.length > 0) {
      setBetaStatus("success");
    } else {
      setBetaStatus("error");
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-10">
        <h1
          className="text-3xl text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Welcome to Beckett, {name}.
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm text-ink-mid">Your plan:</span>
          <span className="bg-ink-light/20 text-ink-mid text-xs font-medium rounded-pill px-2.5 py-0.5">
            Free
          </span>
          <button
            onClick={() => setShowUpgrade(true)}
            className="text-sm text-primary hover:underline"
          >
            Upgrade to Pro →
          </button>
        </div>
      </div>

      {/* Getting started */}
      <div className="bg-white rounded-card border border-border p-6 mb-6">
        <h2
          className="text-lg text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Getting started
        </h2>
        <ul className="space-y-3">
          {gettingStarted.map((item) => (
            <li key={item.label} className="flex items-center gap-3">
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  item.done
                    ? "bg-green-500 border-green-500"
                    : "border-border"
                }`}
              >
                {item.done && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
              </span>
              <span className={`text-sm flex-1 ${item.done ? "line-through text-ink-light" : "text-ink-mid"}`}>
                {item.label}
                {item.proOnly && (
                  <span className="ml-2 text-xs text-primary bg-primary-light px-1.5 py-0.5 rounded-pill">
                    Pro
                  </span>
                )}
              </span>
              {!item.proOnly && (
                <a href={item.href} className="text-xs text-primary hover:underline">
                  Set up →
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Beta code */}
      <div className="bg-white rounded-card border border-border p-6">
        <h2
          className="text-lg text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Have a beta code?
        </h2>
        <p className="text-sm text-ink-mid mb-4">
          Enter your code to unlock full Pro access, free.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value)}
            placeholder="Enter code"
            className="flex-1 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleBetaActivate}
            className="bg-primary text-white text-sm rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors"
          >
            Activate
          </button>
        </div>
        {betaStatus === "success" && (
          <p className="text-green-600 text-xs mt-2">Beta code accepted — refreshing your plan…</p>
        )}
        {betaStatus === "error" && (
          <p className="text-red-600 text-xs mt-2">That code doesn&apos;t look right. Try again.</p>
        )}
      </div>

      {showUpgrade && (
        <UpgradeModal userEmail={userEmail} onClose={() => setShowUpgrade(false)} />
      )}
    </div>
  );
}
