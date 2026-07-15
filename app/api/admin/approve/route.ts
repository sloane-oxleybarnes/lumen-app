import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { trackBetaEvent } from "@/lib/beta-events";
import { triggerLoopsEvent } from "@/lib/loops";
import { sendBetaInviteEmail } from "@/lib/beta-emails";

function buildPasswordSetupLink(origin: string, tokenHash: string, type: "invite" | "recovery") {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/auth/set-password");
  return url.toString();
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  if (cookieStore.get("admin_auth")?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, id } = await req.json();
  if (!email || !id) {
    return NextResponse.json({ error: "email and id required" }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://meetbeckett.co'
  const { data: signup } = await supabase
    .from("beta_signups")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (process.env.RESEND_API_KEY) {
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "invite",
      email: normalizedEmail,
      options: {
        redirectTo: `${origin}/auth/callback`,
        data: { plan: "beta" },
      },
    });

    if (linkError || !linkData.properties?.action_link) {
      return NextResponse.json(
        { error: linkError?.message || "Could not generate invite link." },
        { status: 500 }
      );
    }

    const actionLink = linkData.properties.hashed_token
      ? buildPasswordSetupLink(origin, linkData.properties.hashed_token, "invite")
      : linkData.properties.action_link;

    await sendBetaInviteEmail({
      email: normalizedEmail,
      name: signup?.name || null,
      actionLink,
    });
  } else {
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`,
      data: { plan: 'beta' },
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
  }

  await supabase
    .from("profiles")
    .update({ plan: "beta" })
    .eq("email", normalizedEmail);

  await supabase
    .from("beta_signups")
    .update({
      approved: true,
      approved_at: new Date().toISOString(),
      invite_sent_at: new Date().toISOString(),
      lifecycle_stage: "invited",
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);

  await triggerLoopsEvent(normalizedEmail, "beta_invite_sent");
  await trackBetaEvent({
    email: normalizedEmail,
    eventName: "beta_invite_sent",
    source: "admin",
    metadata: { signupId: id },
  });

  return NextResponse.json({ ok: true });
}
