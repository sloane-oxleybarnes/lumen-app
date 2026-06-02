"use client";

import { useState } from "react";

type Signup = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  approved: boolean;
};

export default function AdminApprovalList({ signups }: { signups: Signup[] }) {
  const [list, setList] = useState(signups);
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function approve(signup: Signup) {
    setLoading(signup.id);
    setErrors((prev) => ({ ...prev, [signup.id]: "" }));

    const res = await fetch("/api/admin/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: signup.email, id: signup.id }),
    });

    if (res.ok) {
      setList((prev) => prev.filter((s) => s.id !== signup.id));
    } else {
      const data = await res.json().catch(() => ({}));
      setErrors((prev) => ({
        ...prev,
        [signup.id]: data.error || "Something went wrong.",
      }));
    }
    setLoading(null);
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <h1 className="text-xl font-semibold text-ink mb-6">
        Beta signups — pending approval ({list.length})
      </h1>

      {list.length === 0 ? (
        <p className="text-ink-mid text-sm">No pending signups.</p>
      ) : (
        <div className="flex flex-col gap-3 max-w-2xl">
          {list.map((signup) => (
            <div
              key={signup.id}
              className="bg-white border border-border rounded-card px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-ink truncate">
                  {signup.name || "—"}
                </span>
                <span className="text-xs text-ink-mid truncate">
                  {signup.email}
                </span>
                <span className="text-xs text-ink-light">
                  {new Date(signup.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {errors[signup.id] && (
                  <span className="text-xs text-red-600 mt-1">
                    {errors[signup.id]}
                  </span>
                )}
              </div>
              <button
                onClick={() => approve(signup)}
                disabled={loading === signup.id}
                className="shrink-0 bg-primary text-white text-xs font-medium rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {loading === signup.id ? "…" : "Approve"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
