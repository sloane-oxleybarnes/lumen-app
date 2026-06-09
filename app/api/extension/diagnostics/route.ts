import { NextResponse } from "next/server";
import { getAiUsageToday, getDailyAiLimit } from "@/lib/ai-usage";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const [{ data: profile }, { data: integrations }, used] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, email, plan, extension_token, updated_at")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("user_integrations")
      .select("provider, external_user_id, external_team_id, external_team_name, connected_at, updated_at")
      .eq("user_id", userId),
    getAiUsageToday(userId),
  ]);

  const limit = getDailyAiLimit();
  const slack = integrations?.find((item) => item.provider === "slack");
  const google = integrations?.find((item) => item.provider === "google");

  return NextResponse.json({
    beckett: {
      authenticated: true,
      email: profile?.email || session.user.email || null,
      plan: profile?.plan || "free",
    },
    extension: {
      tokenIssued: Boolean(profile?.extension_token),
      lastProfileSyncAt: profile?.updated_at || null,
    },
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
    aiUsage: {
      limit,
      used,
      remaining: Math.max(limit - used, 0),
    },
    api: {
      reachable: true,
      checkedAt: new Date().toISOString(),
    },
  });
}
