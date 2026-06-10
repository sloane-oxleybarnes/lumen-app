import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { trackBetaEvent } from "@/lib/beta-events";
import { triggerLoopsEvent } from "@/lib/loops";

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
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${origin}/auth/callback`,
    data: { plan: 'beta' },
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

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
