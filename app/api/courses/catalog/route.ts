import { NextResponse } from "next/server";
import { getPublishedCourseCatalog } from "@/lib/course-content";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { canBrowseWebCourses } from "@/lib/web-credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (!(await canBrowseWebCourses(profile?.plan))) {
    return NextResponse.json({ error: "Courses require Beta or Pro access." }, { status: 403 });
  }

  const courses = await getPublishedCourseCatalog();
  return NextResponse.json({ courses });
}
