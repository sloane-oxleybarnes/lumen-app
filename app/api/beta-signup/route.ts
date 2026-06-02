import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createOrUpdateHubSpotContact } from "@/lib/hubspot";
import { addLoopsContact, triggerLoopsEvent } from "@/lib/loops";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { email, name, source, plan } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("profiles").upsert({
    email,
    full_name: name,
    source: source || "landing_page",
    plan: plan || "beta",
    approved: false,
  }, { onConflict: "email" });

  if (error && error.code !== "23505") {
    console.error("Supabase error:", error);
  }

  const hsId = await createOrUpdateHubSpotContact({
    email,
    firstname: name?.split(" ")[0],
    lastname: name?.split(" ").slice(1).join(" "),
    plan: plan || "beta",
    source: source || "landing_page",
  });

  if (hsId) {
    await supabase
      .from("profiles")
      .update({ hubspot_contact_id: hsId })
      .eq("email", email);
  }

  await addLoopsContact({
    email,
    firstName: name?.split(" ")[0],
    lastName: name?.split(" ").slice(1).join(" "),
    plan: plan || "beta",
    source: source || "landing_page",
  });

  await triggerLoopsEvent(email, "beta_signup", {
    plan: plan || "beta",
    source: source || "landing_page",
  });

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: "Beckett <hello@meetbeckett.co>",
        to: email,
        subject: "You're on the Beckett waitlist",
        html: `<p>Thanks for signing up for Beckett. We're reviewing applications and will send you a link to set up your account once you're approved.</p><p>— Sloane</p>`,
      });
    } catch (e) {
      console.error("Resend signup confirmation error:", e);
    }
    try {
      await resend.emails.send({
        from: "Beckett <hello@meetbeckett.co>",
        to: "hello@meetbeckett.co",
        subject: "New Beckett beta signup",
        html: `<p><strong>${name || "Someone"}</strong> just signed up for the beta.</p><p>Email: ${email}</p><p>Source: ${source || "landing_page"}</p>`,
      });
    } catch (e) {
      console.error("Resend notification error:", e);
    }
  }

  return NextResponse.json({ success: true });
}
