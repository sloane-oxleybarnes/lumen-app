import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import MoodSelector from "@/components/dashboard/MoodSelector";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan")
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

  return (
    <div className="max-w-2xl">
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

      {/* 2x2 grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* Skills started */}
        <div className="bg-white border border-border rounded-card p-5">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">
            Skills started
          </p>
          <p className="text-3xl font-light text-ink mb-1">{skillsStarted}</p>
          <p className="text-xs text-ink-mid">
            {skillsStarted === 1 ? "module" : "modules"}
          </p>
          <Link
            href="/dashboard/skills"
            className="mt-4 inline-block text-xs text-primary hover:underline"
          >
            View all skills →
          </Link>
        </div>

        {/* Upcoming meetings */}
        <div className="bg-white border border-border rounded-card p-5">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">
            Upcoming meetings
          </p>
          <p className="text-sm text-ink-mid leading-relaxed">
            Calendar integration coming soon.
          </p>
          <Link
            href="/dashboard/calendar"
            className="mt-4 inline-block text-xs text-primary hover:underline"
          >
            Learn more →
          </Link>
        </div>

        {/* Mood */}
        <div className="bg-white border border-border rounded-card p-5">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-1">
            Where I am at today
          </p>
          <p className="text-xs text-ink-light mb-1">How are you feeling?</p>
          <MoodSelector />
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-border rounded-card p-5">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">
            Quick actions
          </p>
          <div className="space-y-2">
            <Link
              href="/dashboard/practice"
              className="block w-full text-center bg-primary text-white text-sm rounded-pill py-2 hover:bg-primary-dark transition-colors"
            >
              Practice a conversation
            </Link>
            <Link
              href="/dashboard/skills"
              className="block w-full text-center border border-border text-sm rounded-pill py-2 text-ink hover:bg-bg transition-colors"
            >
              Open skill modules
            </Link>
          </div>
        </div>
      </div>

      {/* Extension download */}
      <div className="bg-white border border-border rounded-card p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">Beckett for Chrome</p>
          <p className="text-xs text-ink-mid mt-0.5">
            Analyze conversations in real time — Gmail, Slack, and Google Meet.
          </p>
        </div>
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors"
        >
          Download
        </a>
      </div>
    </div>
  );
}
