import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/server-admin";
import type { CoachingTone } from "@/lib/onboarding";
import { trackBetaEvent } from "@/lib/beta-events";
import { triggerLoopsEvent, updateLoopsContact } from "@/lib/loops";

type OnboardingBody = {
  email?: string;
  full_name: string;
  first_name: string;
  last_name: string;
  display_name: string;
  strengths?: string[];
  workplace_triggers?: string[];
  communication_preferences?: string[];
  coaching_tone?: CoachingTone;
  neurodivergent_context?: string[];
  neurodivergent_context_other?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as OnboardingBody;
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      id: session.user.id,
      email: body.email || session.user.email,
      full_name: body.full_name,
      first_name: body.first_name,
      last_name: body.last_name,
      display_name: body.display_name,
      strengths: body.strengths || [],
      workplace_triggers: body.workplace_triggers || [],
      communication_preferences: body.communication_preferences || [],
      coaching_tone: body.coaching_tone || "direct_kind",
      neurodivergent_context: body.neurodivergent_context || [],
      neurodivergent_context_other: body.neurodivergent_context_other || null,
      first_login_complete: true,
      onboarding_completed_at: now,
      updated_at: now,
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const email = body.email || session.user.email || null;
  if (email) {
    await supabaseAdmin
      .from("beta_signups")
      .update({ lifecycle_stage: "onboarded", last_activity_at: now })
      .eq("email", email.toLowerCase());

    await updateLoopsContact(email, { onboarded: true });
    await triggerLoopsEvent(email, "onboarding_completed");
  }

  await trackBetaEvent({
    userId: session.user.id,
    email,
    eventName: "onboarding_completed",
    source: "web_app",
    metadata: {
      strengthsCount: body.strengths?.length || 0,
      triggersCount: body.workplace_triggers?.length || 0,
      preferencesCount: body.communication_preferences?.length || 0,
      neurodivergentContextCount: body.neurodivergent_context?.length || 0,
    },
  });

  return NextResponse.json({ ok: true });
}
