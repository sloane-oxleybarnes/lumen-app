"use client";

import { useState } from "react";

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
      <div className="bg-primary-light border border-primary/20 rounded-card px-6 py-5 text-center">
        <p className="text-primary font-medium mb-1">You&apos;re in.</p>
        <p className="text-ink-mid text-sm">
          We&apos;ll be in touch shortly with your beta access.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
      />
      <div className="flex gap-2">
        <input
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
        <p className="text-red-600 text-xs">
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
