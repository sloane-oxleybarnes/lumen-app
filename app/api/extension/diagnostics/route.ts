import { NextResponse } from "next/server";
import { getAiUsageToday, getDailyAiLimit, isUnlimitedAiUser, UNLIMITED_AI_LIMIT } from "@/lib/ai-usage";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const REQUIRED_SLACK_USER_SCOPES = ["channels:history", "groups:history", "im:history", "mpim:history", "users:read"];

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function splitScopes(value: unknown) {
  if (Array.isArray(value)) return value.filter((scope): scope is string => typeof scope === "string");
  return String(value || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

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
      .select("id, email, plan, extension_token, extension_connected_at, updated_at")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("user_integrations")
      .select("provider, external_user_id, external_team_id, external_team_name, metadata, connected_at, updated_at")
      .eq("user_id", userId),
    getAiUsageToday(userId),
  ]);

  const unlimited = await isUnlimitedAiUser(userId);
  const limit = unlimited ? UNLIMITED_AI_LIMIT : getDailyAiLimit();
  const slack = integrations?.find((item) => item.provider === "slack");
  const google = integrations?.find((item) => item.provider === "google");
  const slackMetadata = metadataRecord(slack?.metadata);
  const slackAuthedUser = metadataRecord(slackMetadata.authed_user);
  const slackGrantedUserScopes = splitScopes(slackMetadata.granted_user_scopes || slackAuthedUser.scope || slackMetadata.user_scope);
  const slackMissingUserScopes = REQUIRED_SLACK_USER_SCOPES.filter((scope) => !slackGrantedUserScopes.includes(scope));
  const googleMetadata = metadataRecord(google?.metadata);
  const googleRefreshConfigured = Boolean(
    (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
      (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)
  );
  const googleHasRefreshToken = Boolean(
    typeof googleMetadata.refresh_token === "string" && googleMetadata.refresh_token.trim()
  );

  return NextResponse.json({
    beckett: {
      authenticated: true,
      email: profile?.email || session.user.email || null,
      plan: profile?.plan || "free",
    },
    extension: {
      tokenIssued: Boolean(profile?.extension_token),
      lastProfileSyncAt: profile?.extension_connected_at || profile?.updated_at || null,
    },
    integrations: {
      slack: slack
        ? {
            connected: true,
            userId: slack.external_user_id || null,
            teamId: slack.external_team_id || null,
            teamName: slack.external_team_name || null,
            grantedUserScopes: slackGrantedUserScopes,
            missingUserScopes: slackMissingUserScopes,
            needsReconnect: slackMissingUserScopes.length > 0,
            lastValidatedAt:
              typeof slackMetadata.last_validated_at === "string" ? slackMetadata.last_validated_at : null,
            lastFailureReason:
              typeof slackMetadata.last_failure_reason === "string" ? slackMetadata.last_failure_reason : null,
            connectedAt: slack.connected_at || null,
            updatedAt: slack.updated_at || null,
          }
        : { connected: false },
      google: google
        ? {
            connected: true,
            email:
              google.external_user_id ||
              (google.metadata && typeof google.metadata === "object" && "email" in google.metadata
                ? String(google.metadata.email)
                : null),
            hasRefreshToken: googleHasRefreshToken,
            serverRefreshConfigured: googleRefreshConfigured,
            needsReconnect: !googleHasRefreshToken,
            tokenExpiresAt:
              typeof googleMetadata.token_expires_at === "string" ? googleMetadata.token_expires_at : null,
            lastValidatedAt:
              typeof googleMetadata.last_validated_at === "string" ? googleMetadata.last_validated_at : null,
            lastFailureReason:
              typeof googleMetadata.last_failure_reason === "string" ? googleMetadata.last_failure_reason : null,
            connectedAt: google.connected_at || null,
            updatedAt: google.updated_at || null,
          }
        : { connected: false },
    },
    aiUsage: {
      limit,
      used,
      remaining: unlimited ? UNLIMITED_AI_LIMIT : Math.max(limit - used, 0),
      unlimited,
    },
    api: {
      reachable: true,
      checkedAt: new Date().toISOString(),
    },
  });
}
