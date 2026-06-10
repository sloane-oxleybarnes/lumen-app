import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createOrUpdateHubSpotContact } from "@/lib/hubspot";
import { addLoopsContact, triggerLoopsEvent } from "@/lib/loops";
import { trackBetaEvent } from "@/lib/beta-events";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { email, name, source, plan } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const sourceValue = source || "landing_page";
  const planValue = plan || "beta";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("beta_signups").upsert({
    email: normalizedEmail,
    name,
    source: sourceValue,
    plan: planValue,
    lifecycle_stage: "requested_access",
    last_activity_at: new Date().toISOString(),
  }, { onConflict: "email" });

  if (error && error.code !== "23505") {
    console.error("Supabase error:", error);
  }

  const hsId = await createOrUpdateHubSpotContact({
    email: normalizedEmail,
    firstname: name?.split(" ")[0],
    lastname: name?.split(" ").slice(1).join(" "),
    plan: planValue,
    source: sourceValue,
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

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: "Beckett <hello@meetbeckett.co>",
        to: normalizedEmail,
        subject: "You're on the Beckett waitlist",
        html: `<p>Thanks for signing up — we're reviewing applications and will be in touch if you're accepted into the beta.</p><p>— Sloane</p>`,
      });
    } catch (e) {
      console.error("Resend signup confirmation error:", e);
    }
    try {
      await resend.emails.send({
        from: "Beckett <hello@meetbeckett.co>",
        to: "hello@meetbeckett.co",
        subject: "New Beckett beta signup",
        html: `<p><strong>${name || "Someone"}</strong> just signed up for the beta.</p><p>Email: ${normalizedEmail}</p><p>Source: ${sourceValue}</p>`,
      });
    } catch (e) {
      console.error("Resend notification error:", e);
    }
  }

  return NextResponse.json({ success: true });
}
