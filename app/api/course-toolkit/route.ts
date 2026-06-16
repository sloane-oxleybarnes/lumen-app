import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ToolkitInput = {
  courseId?: string;
  category?: string;
  label?: string;
  content?: string;
};

function cleanText(value: unknown, max = 1000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

async function getUserId() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_toolkit_items")
    .select("id, course_id, category, label, content, created_at, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: ToolkitInput[] };
  const now = new Date().toISOString();
  const rows = (body.items || [])
    .map((item) => ({
      user_id: userId,
      course_id: cleanText(item.courseId, 120),
      category: cleanText(item.category, 120),
      label: cleanText(item.label, 160),
      content: cleanText(item.content, 1000),
      updated_at: now,
    }))
    .filter((item) => item.course_id && item.category && item.label && item.content);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid toolkit items." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_toolkit_items")
    .insert(rows)
    .select("id, course_id, category, label, content, created_at, updated_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = cleanText(body.id, 80);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("course_toolkit_items")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
