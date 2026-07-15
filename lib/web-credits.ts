import { supabaseAdmin } from "./server-admin";

export const WEB_CREDITS_ENABLED = process.env.WEB_CREDIT_SYSTEM_ENABLED === "true";

type CreditPlan = "free" | "beta" | "pro" | "team";

async function isUnlimitedWebCreditUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = (profile?.email || authUser.user?.email || "").trim().toLowerCase();
  const configured = (process.env.WEB_UNLIMITED_CREDIT_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email === "hello@meetbeckett.co" || /^hello\+[^@]+@meetbeckett\.co$/.test(email) || configured.includes(email);
}

export class WebCreditLimitError extends Error {
  status = 429;
  constructor(public kind: "daily" | "monthly") {
    super(kind === "daily" ? "You have used today's coaching credits." : "You have used this month's coaching credits.");
  }
}

export class WebCourseLimitError extends Error {
  status = 403;
  constructor() {
    super("Your Free plan includes two skill courses each month. Your next course unlocks when the monthly limit resets.");
  }
}

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

async function getPlan(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("plan, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    plan: ((data?.plan || "free") as CreditPlan),
    createdAt: data?.created_at ? new Date(data.created_at) : new Date(),
  };
}

function limitsFor(plan: CreditPlan, createdAt: Date, now: Date) {
  if (plan === "beta") return { daily: 60, monthly: 500, courses: null as number | null };
  if (plan === "pro" || plan === "team") return { daily: 100, monthly: 1500, courses: null as number | null };

  const firstDay = utcDayStart(createdAt).getTime() === utcDayStart(now).getTime();
  const firstMonth = utcMonthStart(createdAt).getTime() === utcMonthStart(now).getTime();
  return { daily: firstDay ? 20 : 10, monthly: firstMonth ? 80 : 70, courses: 2 };
}

async function countCredits(userId: string, since: Date) {
  const { data, error } = await supabaseAdmin
    .from("web_credit_events")
    .select("credits")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row.credits || 0), 0);
}

export async function getWebCreditSummary(userId: string) {
  if (!WEB_CREDITS_ENABLED) return { enabled: false as const };

  const now = new Date();
  const dayStart = utcDayStart(now);
  const monthStart = utcMonthStart(now);
  const [{ plan, createdAt }, unlimited, dailyUsed, monthlyUsed] = await Promise.all([
    getPlan(userId),
    isUnlimitedWebCreditUser(userId),
    countCredits(userId, dayStart),
    countCredits(userId, monthStart),
  ]);
  const limits = limitsFor(plan, createdAt, now);

  let coursesUsed = 0;
  if (limits.courses !== null) {
    const { count, error } = await supabaseAdmin
      .from("web_course_unlocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("period_start", monthStart.toISOString().slice(0, 10));
    if (error) throw error;
    coursesUsed = count || 0;
  }

  return {
    enabled: true as const,
    unlimited,
    plan,
    daily: {
      limit: limits.daily,
      used: dailyUsed,
      remaining: unlimited ? limits.daily : Math.max(limits.daily - dailyUsed, 0),
      resetsAt: addUtcDays(dayStart, 1).toISOString(),
    },
    monthly: {
      limit: limits.monthly,
      used: monthlyUsed,
      remaining: unlimited ? limits.monthly : Math.max(limits.monthly - monthlyUsed, 0),
      resetsAt: addUtcMonths(monthStart, 1).toISOString(),
    },
    courses: limits.courses === null ? null : {
      limit: limits.courses,
      used: coursesUsed,
      remaining: Math.max(limits.courses - coursesUsed, 0),
      resetsAt: addUtcMonths(monthStart, 1).toISOString(),
    },
  };
}

export async function assertWebCreditsAvailable(userId: string) {
  const summary = await getWebCreditSummary(userId);
  if (!summary.enabled || summary.unlimited) return summary;
  if (summary.daily.remaining <= 0) throw new WebCreditLimitError("daily");
  if (summary.monthly.remaining <= 0) throw new WebCreditLimitError("monthly");
  return summary;
}

export async function recordSuccessfulWebCredit(userId: string, input: {
  source: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  if (!WEB_CREDITS_ENABLED || await isUnlimitedWebCreditUser(userId)) return;
  const { error } = await supabaseAdmin.from("web_credit_events").insert({
    user_id: userId,
    source: input.source,
    action: input.action,
    credits: 1,
    metadata: input.metadata || {},
  });
  if (error) throw error;
}

export async function canBrowseWebCourses(plan: string | null | undefined) {
  return plan === "pro" || plan === "beta" || plan === "team" || (WEB_CREDITS_ENABLED && plan === "free");
}

export async function ensureWebCourseAccess(userId: string, plan: string | null | undefined, courseId: string) {
  if (plan === "pro" || plan === "beta" || plan === "team") return;
  if (!WEB_CREDITS_ENABLED || plan !== "free") throw new WebCourseLimitError();

  const periodStart = utcMonthStart().toISOString().slice(0, 10);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("web_course_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("period_start", periodStart)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { count, error: countError } = await supabaseAdmin
    .from("web_course_unlocks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("period_start", periodStart);
  if (countError) throw countError;
  if ((count || 0) >= 2) throw new WebCourseLimitError();

  const { error } = await supabaseAdmin.from("web_course_unlocks").insert({
    user_id: userId,
    course_id: courseId,
    period_start: periodStart,
  });
  if (error && error.code !== "23505") throw error;
}
