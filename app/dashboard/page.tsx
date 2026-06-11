import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import MoodSelector from "@/components/dashboard/MoodSelector";
import CoachWalkthrough from "@/components/dashboard/CoachWalkthrough";

export default async function DashboardPage() {
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

  // Skills started — count distinct skill_ids from practice_sessions
  let skillsStarted = 0;
  try {
    const { data: sessions } = await supabase
      .from("practice_sessions")
      .select("skill_id")
      .eq("user_id", session.user.id)
      .not("skill_id", "is", null);
    if (sessions) {
      skillsStarted = new Set(sessions.map((s: { skill_id: string }) => s.skill_id)).size;
    }
  } catch { /* table may not exist yet */ }

  let skillsCompleted = 0;
  try {
    const { data: completions } = await supabase
      .from("course_completions")
      .select("course_id")
      .eq("user_id", session.user.id);
    if (completions) skillsCompleted = completions.length;
  } catch { /* table may not exist yet */ }

  const extensionConnected = Boolean(profile?.extension_connected_at);
  const showWalkthrough = Boolean(
    profile?.first_login_complete && !profile?.dashboard_walkthrough_completed_at
  );

  return (
    <div className="w-full max-w-6xl">
      <CoachWalkthrough shouldShow={showWalkthrough} />
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

      <section className="mb-6 rounded-card border border-border bg-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-light">
              Where I am at today
            </p>
            <h2 className="mt-1 text-xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
              Quick check-in
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-mid">
              Beckett uses this as lightweight context for how much support you may need today.
            </p>
          </div>
          <div className="shrink-0">
            <p className="text-xs text-ink-light">How are you feeling?</p>
            <MoodSelector />
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
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
            <MetricCard label="Skills in progress" value={skillsStarted} detail={skillsStarted === 1 ? "practice started" : "practice sessions started"} />
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

        <div className="rounded-card border border-border bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Quick actions</p>
          <div className="mt-5 space-y-3">
            <Link
              href="/dashboard/practice"
              className="block w-full rounded-pill bg-primary px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Practice a conversation
            </Link>
            <Link
              href="/dashboard/skills"
              className="block w-full rounded-pill border border-border px-5 py-3 text-center text-sm font-medium text-ink transition-colors hover:bg-bg"
            >
              Open skill modules
            </Link>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-ink-light">
            Start with practice when there is a live conversation coming up. Use skills when you want a coached walkthrough.
          </p>
        </div>
      </section>

      {!extensionConnected && (
        <div className="rounded-card border border-border bg-white p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Beckett for Chrome</p>
            <p className="text-xs text-ink-mid mt-0.5">
              Add Beckett to Gmail and Slack for beta coaching in the places your work conversations happen.
            </p>
          </div>
          <a
            href="https://chrome.google.com/webstore"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 bg-primary text-white text-sm rounded-pill px-5 py-2 text-center hover:bg-primary-dark transition-colors"
          >
            Download
          </a>
        </div>
      )}
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
