import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createOrUpdateHubSpotContact } from "@/lib/hubspot";
import { triggerLoopsEvent, updateLoopsContact } from "@/lib/loops";
import { trackBetaEvent } from "@/lib/beta-events";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-env";

export async function POST(req: NextRequest) {
  const { user_id, email, event } = await req.json();

  if (!email || !event) {
    return NextResponse.json(
      { error: "email and event required" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey()
  );

  const normalizedEmail = email.trim().toLowerCase();

  if (event === "installed" || event === "login") {
    await createOrUpdateHubSpotContact({
      email: normalizedEmail,
      extension_installed: true,
    });

    if (event === "installed") {
      await triggerLoopsEvent(normalizedEmail, "extension_installed");
      await updateLoopsContact(normalizedEmail, { extensionInstalled: true });
    }
  }

  if (user_id) {
    await supabase
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", user_id);
  }

  await trackBetaEvent({
    userId: user_id || null,
    email: normalizedEmail,
    eventName: event === "installed" ? "extension_installed" : "extension_login",
    source: "extension",
    metadata: { event },
  });

  return NextResponse.json({ success: true });
}
