import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import WorkdayReminderNudge from "@/components/dashboard/WorkdayReminderNudge";
import CoachWalkthrough from "@/components/dashboard/CoachWalkthrough";
import BetaMissionsCard from "@/components/dashboard/BetaMissionsCard";
import TodayGuide from "@/components/dashboard/TodayGuide";

type DashboardPageProps = {
  searchParams?: {
    tour?: string | string[];
  };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan, extension_connected_at, first_login_complete, dashboard_walkthrough_completed_at")
    .eq("id", session.user.id)
    .single();

  const name =
    profile?.full_name?.split(" ")[0] ||
    session.user.email?.split("@")[0] ||
    "there";

  const tourParam = Array.isArray(searchParams?.tour) ? searchParams?.tour[0] : searchParams?.tour;
  const isBeta = profile?.plan === "beta";
  const showWalkthrough =
    tourParam === "1" ||
    Boolean(profile?.first_login_complete && !profile?.dashboard_walkthrough_completed_at);

  return (
    <div className="w-full max-w-6xl">
      <CoachWalkthrough shouldShow={showWalkthrough} forceShow={tourParam === "1"} isBeta={isBeta} />
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Welcome back, {name}.
        </h1>
        <p className="text-ink-mid text-sm">Here is your day, refreshed as you go.</p>
      </div>

      <TodayGuide name={name} />
      <WorkdayReminderNudge />

      {!isBeta ? <section className="mb-6">
        <div data-tour="start-here" className="rounded-card border border-primary/20 bg-primary-light/40 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Start here</p>
          <h2 className="mt-2 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
            What should I do next?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-mid">
            If there is a real conversation coming up, practice it first. If nothing is urgent,
            start a short skill module and let Beckett coach you through one workplace pattern.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/practice"
              data-tour="start-practice"
              className="rounded-pill bg-primary px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Practice a conversation
            </Link>
            <Link
              href="/dashboard/skills"
              data-tour="start-skills"
              className="rounded-pill border border-primary/30 bg-white px-5 py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-primary-light"
            >
              Pick a skill
            </Link>
          </div>
        </div>

      </section> : null}

      <BetaMissionsCard />

    </div>
  );
}
