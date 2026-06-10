import { supabaseAdmin } from "./server-admin";

type BetaEventInput = {
  userId?: string | null;
  email?: string | null;
  eventName: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export async function trackBetaEvent({
  userId = null,
  email = null,
  eventName,
  source = "app",
  metadata = {},
}: BetaEventInput) {
  try {
    const normalizedEmail = email?.trim().toLowerCase() || null;

    await supabaseAdmin.from("beta_events").insert({
      user_id: userId,
      email: normalizedEmail,
      event_name: eventName,
      source,
      metadata,
    });

    if (normalizedEmail) {
      await supabaseAdmin
        .from("beta_signups")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("email", normalizedEmail);
    }
  } catch (error) {
    console.error("Beta event tracking error:", error);
  }
}
