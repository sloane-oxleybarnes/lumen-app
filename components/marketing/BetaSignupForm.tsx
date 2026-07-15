"use client";

import { useState } from "react";
import Link from "next/link";

export default function BetaSignupForm({
  source = "landing_page",
  buttonLabel = "Join the beta",
  placeholder = "Enter your email",
}: {
  source?: string;
  buttonLabel?: string;
  placeholder?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const res = await fetch("/api/beta-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, source, plan: "beta" }),
    });

    setStatus(res.ok ? "success" : "error");
  }

  if (status === "success") {
    return (
      <div className="bg-primary-light border border-primary/20 rounded-card px-6 py-5 text-center" role="status" aria-live="polite">
        <p className="text-primary font-medium mb-1">You&apos;re in.</p>
        <p className="text-ink-mid text-sm">
          We&apos;ll be in touch shortly with your beta access.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <label className="sr-only" htmlFor={`beta-name-${source}`}>
        Your name
      </label>
      <input
        id={`beta-name-${source}`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
      />
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`beta-email-${source}`}>
          Email for beta access
        </label>
        <input
          id={`beta-email-${source}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={placeholder}
          className="flex-1 border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-primary text-white text-sm font-medium rounded-pill px-5 py-3 hover:bg-primary-dark transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {status === "loading" ? "…" : buttonLabel}
        </button>
      </div>
      {status === "error" && (
        <p className="text-red-600 text-xs" role="alert">
          Something went wrong. Please try again.
        </p>
      )}
      <p className="text-xs leading-relaxed text-ink-light">
        By requesting access, you confirm that you are at least 18, are located in the United
        States, and agree to Beckett&apos;s{" "}
        <Link href="/terms" className="text-primary hover:underline">Terms</Link> and{" "}
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}
