import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server-admin";
import { sendBetaInviteReminderEmail, sendSetupNudgeEmail } from "@/lib/beta-emails";
import { trackBetaEvent } from "@/lib/beta-events";
import { canSendLifecycleMessages, getPublicSiteUrl, lifecycleMessagesDisabledReason } from "@/lib/deployment-env";

type AutomationResult = {
  inviteReminders: number;
  setupNudges: number;
  errors: string[];
};

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;

  const cookieStore = cookies();
  return cookieStore.get("admin_auth")?.value === process.env.ADMIN_PASSWORD;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function buildPasswordSetupLink(origin: string, tokenHash: string, type: "invite" | "recovery") {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/auth/set-password");
  return url.toString();
}

async function createSetupLink(email: string, origin: string) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`,
    },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(error?.message || "Could not generate setup link.");
  }

  return data.properties.hashed_token
    ? buildPasswordSetupLink(origin, data.properties.hashed_token, "recovery")
    : data.properties.action_link;
}

async function runEmailAutomations(req: NextRequest, dryRun: boolean) {
  const origin = getPublicSiteUrl(req.nextUrl.origin);
  const result: AutomationResult = {
    inviteReminders: 0,
    setupNudges: 0,
    errors: [],
  };

  const { data: inviteCandidates } = await supabaseAdmin
    .from("beta_signups")
    .select("id, email, name, invite_sent_at")
    .eq("approved", true)
    .is("invite_reminder_sent_at", null)
    .lt("invite_sent_at", daysAgo(3));

  for (const signup of inviteCandidates || []) {
    try {
      if (!dryRun) {
        const actionLink = await createSetupLink(signup.email, origin);
        await sendBetaInviteReminderEmail({
          email: signup.email,
          name: signup.name,
          actionLink,
        });

        await supabaseAdmin
          .from("beta_signups")
          .update({
            invite_reminder_sent_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", signup.id);

        await trackBetaEvent({
          email: signup.email,
          eventName: "beta_invite_reminder_sent",
          source: "email_automation",
          metadata: { signupId: signup.id },
        });
      }
      result.inviteReminders += 1;
    } catch (error) {
      result.errors.push(
        `Invite reminder failed for ${signup.email}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, first_name, onboarding_completed_at, extension_connected_at")
    .eq("plan", "beta")
    .not("onboarding_completed_at", "is", null)
    .is("extension_connected_at", null)
    .lt("onboarding_completed_at", daysAgo(1));

  for (const profile of profiles || []) {
    if (!profile.email) continue;

    const { data: existingNudge } = await supabaseAdmin
      .from("beta_events")
      .select("id")
      .eq("email", profile.email.toLowerCase())
      .eq("event_name", "setup_nudge_sent")
      .limit(1)
      .maybeSingle();

    if (existingNudge) continue;

    const { count: connectedTools } = await supabaseAdmin
      .from("user_integrations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);

    if ((connectedTools || 0) > 0) continue;

    try {
      if (!dryRun) {
        await sendSetupNudgeEmail({
          email: profile.email,
          name: profile.first_name || profile.full_name,
          dashboardUrl: `${origin}/dashboard/settings`,
        });

        await trackBetaEvent({
          userId: profile.id,
          email: profile.email,
          eventName: "setup_nudge_sent",
          source: "email_automation",
          metadata: {},
        });
      }
      result.setupNudges += 1;
    } catch (error) {
      result.errors.push(
        `Setup nudge failed for ${profile.email}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const lifecycleMessagesEnabled = canSendLifecycleMessages();
  const effectiveDryRun = dryRun || !lifecycleMessagesEnabled;
  const result = await runEmailAutomations(req, effectiveDryRun);
  return NextResponse.json({
    ok: true,
    dryRun: effectiveDryRun,
    lifecycleMessagesEnabled,
    warning: lifecycleMessagesEnabled ? null : lifecycleMessagesDisabledReason(),
    result,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const lifecycleMessagesEnabled = canSendLifecycleMessages();
  const effectiveDryRun = Boolean(body.dryRun) || !lifecycleMessagesEnabled;
  const result = await runEmailAutomations(req, effectiveDryRun);
  return NextResponse.json({
    ok: true,
    dryRun: effectiveDryRun,
    lifecycleMessagesEnabled,
    warning: lifecycleMessagesEnabled ? null : lifecycleMessagesDisabledReason(),
    result,
  });
}
