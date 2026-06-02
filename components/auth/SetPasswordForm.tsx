"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

export default function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold text-ink mb-2">Set your password</h1>
        <p className="text-ink-mid text-sm mb-8">
          Choose a password to secure your Beckett account.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            required
            className="border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            required
            className="border border-border rounded-sm px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-white text-sm font-medium rounded-pill px-5 py-3 hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? "Setting password…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
