"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";

const planBadgeColor: Record<string, string> = {
  free: "bg-ink-light/20 text-ink-mid",
  beta: "bg-primary-light text-primary",
  pro: "bg-primary text-white",
  team: "bg-amber-100 text-amber-700",
};

export default function DashboardSidebar({
  profile,
  userEmail,
}: {
  profile: Profile | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const plan = profile?.plan || "free";

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isPro = plan === "pro" || plan === "beta";

  const navItems = [
    { href: "/dashboard", label: "Overview", icon: "◈" },
    ...(isPro ? [
      { href: "/dashboard/practice", label: "Practice", icon: "💬" },
      { href: "/dashboard/skills", label: "Skills", icon: "✦" },
    ] : []),
    { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
    ...(plan === "team" && profile?.role === "admin"
      ? [{ href: "/dashboard/team", label: "Team", icon: "👥" }]
      : []),
    ...(plan === "free"
      ? [{ href: "/pricing", label: "Upgrade", icon: "⬆" }]
      : []),
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link
          href="/dashboard"
          className="text-xl text-ink"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Beckett
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${
              pathname === item.href
                ? "bg-primary-light text-primary font-medium"
                : "text-ink-mid hover:text-ink hover:bg-bg"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-light rounded-full flex items-center justify-center text-primary text-sm font-medium">
            {(profile?.full_name || userEmail)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink font-medium truncate">
              {profile?.full_name || userEmail}
            </p>
            <p className="text-xs text-ink-light truncate">{userEmail}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-medium rounded-pill px-2.5 py-0.5 capitalize ${planBadgeColor[plan]}`}
          >
            {plan}
          </span>
          <button
            onClick={signOut}
            className="text-xs text-ink-light hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
