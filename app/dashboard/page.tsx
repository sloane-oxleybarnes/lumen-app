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

  const { data: integrations } = await supabase
    .from("user_integrations")
    .select("provider, connected_at, updated_at")
    .eq("user_id", session.user.id);

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

  const extensionConnected = Boolean(profile?.extension_connected_at);
  const gmailConnected = Boolean(integrations?.some((item) => item.provider === "google"));
  const slackConnected = Boolean(integrations?.some((item) => item.provider === "slack"));
  const setupItems = [
    {
      label: "Chrome extension",
      description: "Use Beckett inside Gmail and Slack.",
      done: extensionConnected,
      href: "/dashboard/settings",
      action: extensionConnected ? "Connected" : "Set up",
    },
    {
      label: "Gmail",
      description: "Let Beckett read full email threads when you ask.",
      done: gmailConnected,
      href: "/dashboard/settings",
      action: gmailConnected ? "Connected" : "Connect",
    },
    {
      label: "Slack",
      description: "Let Beckett use Slack context in DMs, channels, and threads.",
      done: slackConnected,
      href: "/dashboard/settings",
      action: slackConnected ? "Connected" : "Connect",
    },
  ];
  const setupCompleteCount = setupItems.filter((item) => item.done).length;
  const setupComplete = setupCompleteCount === setupItems.length;
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

      <section className={`mb-6 grid gap-5 ${setupComplete ? "" : "lg:grid-cols-[1fr_1fr]"}`}>
        <div className="rounded-card border border-primary/20 bg-primary-light/40 p-6">
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

        {!setupComplete && (
          <div data-tour="beta-setup" className="rounded-card border border-border bg-white p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Beta setup</p>
                <h2 className="mt-1 text-xl text-ink" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>
                  Connect your coaching tools
                </h2>
              </div>
              <span className="rounded-pill bg-bg px-3 py-1 text-xs font-medium text-ink-mid">
                {setupCompleteCount}/3 done
              </span>
            </div>
            <div className="space-y-3">
              {setupItems.map((item) => (
                <SetupChecklistItem key={item.label} {...item} />
              ))}
            </div>
          </div>
        )}
      </section>

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

function SetupChecklistItem({
  label,
  description,
  done,
  href,
  action,
}: {
  label: string;
  description: string;
  done: boolean;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-sm border border-border bg-bg/50 p-3">
      <div className="flex min-w-0 gap-3">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
            done ? "border-primary bg-primary text-white" : "border-border bg-white text-ink-light"
          }`}
          aria-hidden="true"
        >
          {done ? "✓" : ""}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-mid">{description}</p>
        </div>
      </div>
      <Link
        href={href}
        className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors ${
          done
            ? "bg-primary-light text-primary"
            : "border border-border bg-white text-ink-mid hover:border-primary hover:text-ink"
        }`}
      >
        {action}
      </Link>
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
