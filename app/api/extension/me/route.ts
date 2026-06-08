import { NextRequest, NextResponse } from "next/server";
import { getExtensionProfile } from "@/lib/extension-auth";
import { supabaseAdmin } from "@/lib/server-admin";

export async function GET(req: NextRequest) {
  const authProfile = await getExtensionProfile(req);
  if (!authProfile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, first_name, display_name, plan")
    .eq("id", authProfile.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    email: profile.email || null,
    name: profile.display_name || profile.first_name || profile.full_name || null,
    fullName: profile.full_name || null,
    plan: profile.plan || authProfile.plan || "beta",
  });
}

