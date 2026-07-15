import { NextRequest, NextResponse } from "next/server";
import { getPublishedCourse } from "@/lib/course-content";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ensureWebCourseAccess, WebCourseLimitError } from "@/lib/web-credits";

export const dynamic = "force-dynamic";

async function requireCourseAccess() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  return { ok: true as const, userId: user.id, plan: profile?.plan || "free" };
}

export async function GET(req: NextRequest) {
  const access = await requireCourseAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const courseId = req.nextUrl.searchParams.get("id")?.trim();
  if (!courseId) {
    return NextResponse.json({ error: "Course ID is required." }, { status: 400 });
  }

  try {
    await ensureWebCourseAccess(access.userId, access.plan, courseId);
  } catch (error) {
    if (error instanceof WebCourseLimitError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const course = await getPublishedCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  return NextResponse.json({ course });
}
