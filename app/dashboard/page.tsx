import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import WorkdayCheckinCard from "@/components/dashboard/WorkdayCheckinCard";
import CoachWalkthrough from "@/components/dashboard/CoachWalkthrough";
import BetaMissionsCard from "@/components/dashboard/BetaMissionsCard";

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

  let skillsCompleted = 0;
  const completedCourseIds = new Set<string>();
  try {
    const { data: completions } = await supabase
      .from("course_completions")
      .select("course_id")
      .eq("user_id", session.user.id)
    if (completions) {
      skillsCompleted = completions.length;
      completions.forEach((completion: { course_id: string }) => completedCourseIds.add(completion.course_id));
    }
  } catch { /* table may not exist yet */ }

  let skillsStarted = 0;
  try {
    const { data: progressRows } = await supabase
      .from("course_progress")
      .select("course_id")
      .eq("user_id", session.user.id);
    if (progressRows) {
      skillsStarted = progressRows.filter((row: { course_id: string }) => !completedCourseIds.has(row.course_id)).length;
    }
  } catch { /* table may not exist yet */ }

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
        <p className="text-ink-mid text-sm">Here is where things stand today.</p>
      </div>

      <WorkdayCheckinCard />

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

      <section className="mb-6">
        <div className="rounded-card border border-border bg-white p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Skills</p>
              <h2 className="mt-1 text-2xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
                Your coaching progress
              </h2>
            </div>
            <Link href="/dashboard/skills" className="shrink-0 text-xs text-primary hover:underline">
              View skills →
            </Link>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Skills completed" value={skillsCompleted} detail={skillsCompleted === 1 ? "course finished" : "courses finished"} />
            <MetricCard label="Skills in progress" value={skillsStarted} detail={skillsStarted === 1 ? "course saved" : "courses saved"} />
          </div>
          <div className="rounded-card border border-primary/20 bg-primary-light/50 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Recommended next course</p>
            <h3 className="mt-2 text-base font-medium text-ink">Introducing yourself to a new colleague</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-mid">
              A foundational workplace course for starting a new professional relationship clearly and without over-scripting.
            </p>
            <Link href="/dashboard/skills" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
              See professional courses →
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-card border border-border bg-bg/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p>
      <p className="mt-2 text-3xl font-light text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-mid">{detail}</p>
    </div>
  );
}
