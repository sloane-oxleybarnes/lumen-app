import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createOrUpdateHubSpotContact } from "@/lib/hubspot";
import { addLoopsContact, triggerLoopsEvent } from "@/lib/loops";
import { trackBetaEvent } from "@/lib/beta-events";
import { sendBetaSignupConfirmation } from "@/lib/beta-emails";
import { getSupabaseServiceRoleKey, normalizeSupabaseUrl } from "@/lib/supabase-env";

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isMissingOptionalBetaSignupColumn(error: SupabaseError) {
  const message = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return (
    error.code === "PGRST204" ||
    message.includes("lifecycle_stage") ||
    message.includes("last_activity_at")
  );
}

export async function POST(req: NextRequest) {
  const { email, name, source, plan } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const sourceValue = source || "landing_page";
  const planValue = plan || "beta";
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  let serviceRoleKey = "";
  try {
    serviceRoleKey = getSupabaseServiceRoleKey();
  } catch {}

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Beta signup config error: Supabase admin credentials are missing.");
    return NextResponse.json(
      { error: "Signup is temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }

  let supabase;
  try {
    supabase = createClient(supabaseUrl, serviceRoleKey);
  } catch (configError) {
    console.error("Beta signup config error:", configError);
    return NextResponse.json(
      { error: "Signup is temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }

  const signupPayload = {
    email: normalizedEmail,
    name,
    source: sourceValue,
    plan: planValue,
    lifecycle_stage: "requested_access",
    last_activity_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("beta_signups")
    .upsert(signupPayload, { onConflict: "email" });

  if (error) {
    if (isMissingOptionalBetaSignupColumn(error)) {
      console.warn(
        "Supabase beta_signups is missing lifecycle columns. Retrying with base signup fields.",
        error
      );

      const { error: fallbackError } = await supabase
        .from("beta_signups")
        .upsert({
          email: normalizedEmail,
          name,
          source: sourceValue,
          plan: planValue,
        }, { onConflict: "email" });

      if (!fallbackError) {
        return NextResponse.json({ success: true, warning: "beta_signup_schema_outdated" });
      }

      console.error("Supabase fallback beta signup error:", fallbackError);
    }

    console.error("Supabase beta signup error:", error);
    return NextResponse.json(
      { error: "We could not save your beta signup. Please try again." },
      { status: 500 }
    );
  }

  const hsId = await createOrUpdateHubSpotContact({
    email: normalizedEmail,
    firstname: name?.split(" ")[0],
    lastname: name?.split(" ").slice(1).join(" "),
    plan: planValue,
    source: sourceValue,
    properties: {
      beckett_beta_status: "requested_access",
      beckett_plan: planValue,
      beckett_source: sourceValue,
      beckett_last_active_at: new Date().toISOString(),
    },
  });

  if (hsId) {
    await supabase
      .from("beta_signups")
      .update({ hubspot_contact_id: hsId })
      .eq("email", normalizedEmail);
  }

  await addLoopsContact({
    email: normalizedEmail,
    firstName: name?.split(" ")[0],
    lastName: name?.split(" ").slice(1).join(" "),
    plan: planValue,
    source: sourceValue,
  });

  await triggerLoopsEvent(normalizedEmail, "beta_signup", {
    plan: planValue,
    source: sourceValue,
  });

  await trackBetaEvent({
    email: normalizedEmail,
    eventName: "beta_signup_requested",
    source: sourceValue,
    metadata: { plan: planValue, name: name || null },
  });

  try {
    await sendBetaSignupConfirmation({
      email: normalizedEmail,
      name,
    });
  } catch (e) {
    console.error("Resend signup confirmation error:", e);
  }

  return NextResponse.json({ success: true });
}
