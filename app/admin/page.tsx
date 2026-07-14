import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import AdminLoginForm from "./LoginForm";
import AdminTabs from "./AdminTabs";
import AdminApprovalList from "./ApprovalList";
import AdminContentEditor from "./ContentEditor";
import AdminCourseStudio from "./CourseStudio";
import AdminBetaTracker, {
  type BetaTrackerRow,
  type BetaMissionCoverage,
  type BetaMissionFeedbackSummary,
} from "./BetaTracker";
import AdminFeedbackViewer, { type AdminFeedbackRow } from "./FeedbackViewer";
import { getCourseStudioItems } from "@/lib/course-content";
import { getSiteContent } from "@/lib/site-content-server";
import { BETA_MISSION_DEFINITIONS, getBetaMissionDefinition } from "@/lib/beta-missions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = cookies();
  const isAuthed =
    cookieStore.get("admin_auth")?.value === process.env.ADMIN_PASSWORD;

  if (!isAuthed) {
    return <AdminLoginForm />;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: signups },
    { data: profiles },
    { data: integrations },
    { data: aiUsage },
    { data: courseCompletions },
    { data: feedback },
    { data: betaEvents },
    { data: missionAssignments },
    content,
    courses,
  ] = await Promise.all([
    supabase
      .from("beta_signups")
      .select("id, email, name, created_at, approved, lifecycle_stage, approved_at, invite_sent_at, last_activity_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, email, full_name, display_name, first_name, plan, created_at, first_login_complete, onboarding_completed_at, extension_connected_at")
      .in("plan", ["beta", "pro"]),
    supabase
      .from("user_integrations")
      .select("user_id, provider, connected_at, updated_at"),
    supabase
      .from("ai_usage_events")
      .select("user_id, action, source, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("course_completions")
      .select("user_id, course_id, completed_at"),
    supabase
      .from("beta_feedback")
      .select("id, user_id, rating, comment, platform, mode, source, thread_count, sender, sender_email, response_text, analysis_result, context_snapshot, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("beta_events")
      .select("id, user_id, email, event_name, source, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("beta_mission_assignments")
      .select("id, user_id, mission_key, status, presented_at, feedback_rating, feedback_comment, feedback_at, created_at"),
    getSiteContent(),
    getCourseStudioItems(),
  ]);

  const pendingSignups = (signups || []).filter((signup) => !signup.approved);
  const feedbackRows = (feedback || []) as AdminFeedbackRow[];
  const trackerRows = buildBetaTrackerRows({
    signups: signups || [],
    profiles: profiles || [],
    integrations: integrations || [],
    aiUsage: aiUsage || [],
    courseCompletions: courseCompletions || [],
    feedback: feedback || [],
    betaEvents: betaEvents || [],
    missionAssignments: missionAssignments || [],
  });
  const profileEmailById = new Map((profiles || []).map((profile) => [profile.id, profile.email]));
  const missionCoverage: BetaMissionCoverage[] = Object.values(BETA_MISSION_DEFINITIONS).map((definition) => {
    const matching = (missionAssignments || []).filter((item) => item.mission_key === definition.key);
    return {
      key: definition.key,
      label: definition.title,
      shown: matching.filter((item) => item.presented_at).length,
      completed: matching.filter((item) => item.status === "completed").length,
      skipped: matching.filter((item) => item.status === "skipped").length,
    };
  });
  const missionFeedback: BetaMissionFeedbackSummary[] = (missionAssignments || [])
    .filter((item) => item.feedback_rating === "helpful" || item.feedback_rating === "not_helpful")
    .map((item) => ({
      id: item.id,
      email: profileEmailById.get(item.user_id) || "Unknown tester",
      missionLabel: getBetaMissionDefinition(item.mission_key)?.title || item.mission_key,
      rating: item.feedback_rating as "helpful" | "not_helpful",
      comment: item.feedback_comment,
      createdAt: item.feedback_at || item.created_at,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <AdminTabs
      tabs={[
        {
          id: "beta-testers",
          label: "Beta testers",
          description: "Approve new beta users and track setup, activity, course progress, and feedback.",
          count: trackerRows.length,
        },
        {
          id: "feedback",
          label: "Feedback",
          description: "Review beta feedback from dashboard pages, courses, practice, and extension analyses.",
          count: feedbackRows.length,
        },
        {
          id: "skills",
          label: "Skills",
          description: "Edit, duplicate, draft, and publish course content for the Skills library.",
          count: courses.length,
        },
        {
          id: "website",
          label: "Website",
          description: "Edit public website copy and launch-related site content.",
        },
      ]}
    >
      <div className="space-y-10 [&>section]:mt-0">
        <AdminApprovalList signups={pendingSignups} />
        <AdminBetaTracker rows={trackerRows} missionCoverage={missionCoverage} missionFeedback={missionFeedback} />
      </div>
      <AdminFeedbackViewer feedback={feedbackRows} profiles={profiles || []} />
      <AdminCourseStudio courses={courses} />
      <AdminContentEditor content={content} />
    </AdminTabs>
  );
}

type SignupRow = {
  email: string;
  name: string | null;
  created_at: string;
  approved: boolean;
  lifecycle_stage?: string | null;
  approved_at?: string | null;
  invite_sent_at?: string | null;
  last_activity_at?: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  display_name?: string | null;
  first_name?: string | null;
  created_at: string;
  onboarding_completed_at?: string | null;
  extension_connected_at?: string | null;
};

type IntegrationRow = {
  user_id: string;
  provider: string;
  connected_at?: string | null;
  updated_at?: string | null;
};

type ActivityRow = {
  user_id: string;
  created_at: string;
};

type CourseCompletionRow = {
  user_id: string;
  completed_at?: string | null;
};

type FeedbackRow = ActivityRow & {
  rating: string;
};

type BetaEventRow = {
  user_id: string | null;
  email: string | null;
  event_name: string;
  source: string;
  created_at: string;
};

type MissionAssignmentRow = {
  user_id: string;
  mission_key: string;
  status: "active" | "completed" | "skipped";
};

function buildBetaTrackerRows({
  signups,
  profiles,
  integrations,
  aiUsage,
  courseCompletions,
  feedback,
  betaEvents,
  missionAssignments,
}: {
  signups: SignupRow[];
  profiles: ProfileRow[];
  integrations: IntegrationRow[];
  aiUsage: ActivityRow[];
  courseCompletions: CourseCompletionRow[];
  feedback: FeedbackRow[];
  betaEvents: BetaEventRow[];
  missionAssignments: MissionAssignmentRow[];
}): BetaTrackerRow[] {
  const profileByEmail = new Map(profiles.map((profile) => [profile.email.toLowerCase(), profile]));
  const signupByEmail = new Map(signups.map((signup) => [signup.email.toLowerCase(), signup]));
  const emails = Array.from(new Set([...Array.from(profileByEmail.keys()), ...Array.from(signupByEmail.keys())]));

  return emails.map((email) => {
    const profile = profileByEmail.get(email) || null;
    const signup = signupByEmail.get(email) || null;
    const userId = profile?.id || "";
    const userIntegrations = integrations.filter((item) => item.user_id === userId);
    const google = userIntegrations.find((item) => item.provider === "google");
    const slack = userIntegrations.find((item) => item.provider === "slack");
    const analyses = aiUsage.filter((item) => item.user_id === userId);
    const courses = courseCompletions.filter((item) => item.user_id === userId);
    const feedbackRows = feedback.filter((item) => item.user_id === userId);
    const missions = missionAssignments.filter((item) => item.user_id === userId);
    const recentEvents = betaEvents
      .filter((item) => (userId && item.user_id === userId) || item.email?.toLowerCase() === email)
      .slice(0, 5)
      .map((item) => ({
        eventName: item.event_name,
        source: item.source,
        createdAt: item.created_at,
      }));

    return {
      email: profile?.email || signup?.email || email,
      name: profile?.display_name || profile?.first_name || profile?.full_name || signup?.name || null,
      lifecycleStage: signup?.lifecycle_stage || (profile ? "account_created" : null),
      signedUpAt: signup?.created_at || null,
      approvedAt: signup?.approved_at || null,
      inviteSentAt: signup?.invite_sent_at || null,
      lastActivityAt: signup?.last_activity_at || recentEvents[0]?.createdAt || null,
      approved: Boolean(signup?.approved || profile),
      accountCreatedAt: profile?.created_at || null,
      onboardedAt: profile?.onboarding_completed_at || null,
      extensionConnectedAt: profile?.extension_connected_at || null,
      gmailConnectedAt: google?.connected_at || google?.updated_at || null,
      slackConnectedAt: slack?.connected_at || slack?.updated_at || null,
      analysisCount: analyses.length,
      firstAnalysisAt: analyses[0]?.created_at || null,
      courseCompletions: courses.length,
      feedbackCount: feedbackRows.length,
      negativeFeedbackCount: feedbackRows.filter((item) => item.rating === "no").length,
      lastFeedbackAt: feedbackRows.at(-1)?.created_at || null,
      missionAssignedCount: missions.length,
      missionCompletedCount: missions.filter((item) => item.status === "completed").length,
      missionSkippedCount: missions.filter((item) => item.status === "skipped").length,
      activeMissionLabels: missions
        .filter((item) => item.status === "active")
        .map((item) => getBetaMissionDefinition(item.mission_key)?.title || item.mission_key),
      recentEvents,
    };
  }).sort((a, b) => {
    const aTime = Date.parse(a.signedUpAt || a.accountCreatedAt || "1970-01-01");
    const bTime = Date.parse(b.signedUpAt || b.accountCreatedAt || "1970-01-01");
    return bTime - aTime;
  });
}
