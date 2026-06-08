"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan") || "free";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">(
    planParam === "pro" ? "pro" : "free"
  );
  const [betaCode, setBetaCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    // Non-blocking Loops and HubSpot sync
    fetch("/api/loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "trigger_event",
        email,
        eventName: "user_signup",
        properties: { plan: plan || "free" },
      }),
    }).catch(() => {});

    fetch("/api/loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_contact",
        email,
        contactData: {
          firstName: fullName.split(" ")[0],
          lastName: fullName.split(" ").slice(1).join(" "),
          plan: plan || "free",
          source: "signup",
        },
      }),
    }).catch(() => {});

    fetch("/api/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync_contact",
        contact: {
          email,
          firstname: fullName.split(" ")[0],
          lastname: fullName.split(" ").slice(1).join(" "),
          plan: plan || "free",
          source: "signup",
        },
      }),
    }).catch(() => {});

    router.push("/auth/profile-setup");
    router.refresh();
  }

  async function handleGoogleSignup() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span
              className="text-2xl text-ink"
              style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
            >
              Beckett
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-card border border-border p-8 shadow-sm">
          <h1
            className="text-2xl text-ink mb-2"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Create your account
          </h1>
          <p className="text-ink-light text-sm mb-6">
            Start communicating with more clarity and confidence
          </p>

          <button
            onClick={handleGoogleSignup}
            className="w-full flex items-center justify-center gap-3 border border-border rounded-pill py-3 px-4 text-ink text-sm font-medium hover:bg-primary-light transition-colors mb-6"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-ink-light bg-white px-2">
              or sign up with email
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="8+ characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                Plan
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["free", "pro"] as const).map((p) => (
                  <label
                    key={p}
                    className={`flex items-center gap-2 border rounded-sm px-3 py-2 cursor-pointer text-sm transition-colors ${
                      plan === p
                        ? "border-primary bg-primary-light text-primary"
                        : "border-border text-ink hover:border-primary-mid"
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={p}
                      checked={plan === p}
                      onChange={() => setPlan(p)}
                      className="sr-only"
                    />
                    <span className="capitalize font-medium">{p}</span>
                    {p === "pro" && (
                      <span className="ml-auto text-xs text-ink-light">
                        coming soon
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Beta code{" "}
                <span className="text-ink-light font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={betaCode}
                onChange={(e) => setBetaCode(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter your beta code"
              />
              {betaCode && (
                <p className="text-xs text-primary mt-1">
                  Beta code will give you full Pro access
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-ink-light mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
