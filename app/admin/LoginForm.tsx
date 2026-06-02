"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80">
        <h1 className="text-xl font-semibold text-ink">Admin</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        />
        {error && (
          <p className="text-red-600 text-xs">Incorrect password.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white text-sm font-medium rounded-pill px-5 py-3 hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? "…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
