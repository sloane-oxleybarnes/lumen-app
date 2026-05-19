import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import SignOutButton from "@/components/dashboard/SignOutButton";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan")
    .eq("id", session.user.id)
    .single();

  const name =
    profile?.full_name?.split(" ")[0] ||
    session.user.email?.split("@")[0] ||
    "there";

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl text-ink"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          beck<span className="text-primary">ett</span>
        </Link>
        <SignOutButton />
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-primary-light text-primary text-xs font-medium rounded-pill px-4 py-2 mb-8">
          <span className="w-2 h-2 bg-primary rounded-full inline-block" />
          Beta · Full access
        </div>

        <h1
          className="text-4xl text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Welcome back, {name}.
        </h1>

        <p className="text-ink-mid leading-relaxed mb-10 text-base">
          You have full beta access. The extension is your main tool for now
          — the dashboard is coming soon.
        </p>

        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary text-white rounded-pill px-7 py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          Download the extension
        </a>
      </div>
    </div>
  );
}
