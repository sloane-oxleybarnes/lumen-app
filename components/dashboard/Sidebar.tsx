"use client";

import { useState } from "react";
import Image from "next/image";
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

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/coach", label: "Coach" },
  { href: "/dashboard/practice", label: "Practice" },
  { href: "/dashboard/skills", label: "Skills" },
  { href: "/dashboard/contacts", label: "Contacts" },
  { href: "/dashboard/calendar", label: "Calendar & Meetings" },
  { href: "/dashboard/about", label: "About Me" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardSidebar({
  profile,
  userEmail,
  desktopCollapsed,
  onDesktopCollapseChange,
}: {
  profile: Profile | null;
  userEmail: string;
  desktopCollapsed: boolean;
  onDesktopCollapseChange: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const plan = profile?.plan || "free";
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-border flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="relative block h-9 w-36"
          onClick={() => setMobileOpen(false)}
        >
          <Image
            src="/brand/beckett-horizontal-logo.png"
            alt="Beckett"
            fill
            sizes="144px"
            className="object-contain object-left"
            priority
          />
          <span className="sr-only">Beckett</span>
        </Link>
        <button
          type="button"
          onClick={() => onDesktopCollapseChange(true)}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm text-ink-mid transition-colors hover:border-primary-mid hover:text-ink md:flex"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          {"<"}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-ink-light hover:text-ink text-xl leading-none"
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-tour={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center px-3 py-2 rounded-sm text-sm transition-colors ${
                pathname === item.href || (item.href === "/dashboard/contacts" && pathname.startsWith("/dashboard/trusted-people"))
                  ? "bg-primary-light text-primary font-medium"
                  : "text-ink-mid hover:text-ink hover:bg-bg"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
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
    </>
  );

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex flex-col items-center justify-center gap-1.5 bg-white border border-border rounded-sm shadow-sm"
        aria-label="Open menu"
      >
        <span className="w-4 h-px bg-ink block" />
        <span className="w-4 h-px bg-ink block" />
        <span className="w-4 h-px bg-ink block" />
      </button>

      {desktopCollapsed && (
        <div className="fixed left-0 top-0 bottom-0 z-40 hidden w-16 border-r border-border bg-white md:block">
          <button
            type="button"
            onClick={() => onDesktopCollapseChange(false)}
            className="absolute left-3 top-4 flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-sm border border-border bg-white shadow-sm transition-colors hover:border-primary-mid"
            aria-label="Open sidebar"
            aria-expanded={false}
            title="Open sidebar"
          >
            <span className="w-4 h-px bg-ink block" />
            <span className="w-4 h-px bg-ink block" />
            <span className="w-4 h-px bg-ink block" />
          </button>
        </div>
      )}

      {/* Backdrop — mobile only */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed on desktop, slide-in on mobile */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-border flex flex-col z-50 transition-[left,transform] duration-200 md:translate-x-0 ${
          desktopCollapsed ? "md:-left-64" : "md:left-0"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
