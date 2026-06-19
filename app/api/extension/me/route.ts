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

  const { data: integrations } = await supabaseAdmin
    .from("user_integrations")
    .select("provider, external_user_id, external_team_id, external_team_name, connected_at, updated_at")
    .eq("user_id", authProfile.id);

  const slack = integrations?.find((item) => item.provider === "slack");
  const google = integrations?.find((item) => item.provider === "google");

  return NextResponse.json({
    id: profile.id,
    email: profile.email || null,
    name: profile.display_name || profile.first_name || profile.full_name || null,
    fullName: profile.full_name || null,
    plan: profile.plan || authProfile.plan || "beta",
    integrations: {
      slack: slack
        ? {
            connected: true,
            userId: slack.external_user_id || null,
            teamId: slack.external_team_id || null,
            teamName: slack.external_team_name || null,
            connectedAt: slack.connected_at || null,
            updatedAt: slack.updated_at || null,
          }
        : { connected: false },
      google: google
        ? {
            connected: true,
            connectedAt: google.connected_at || null,
            updatedAt: google.updated_at || null,
          }
        : { connected: false },
    },
  });
}
