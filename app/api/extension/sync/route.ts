import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createOrUpdateHubSpotContact } from "@/lib/hubspot";
import { triggerLoopsEvent, updateLoopsContact } from "@/lib/loops";

export async function POST(req: NextRequest) {
  const { user_id, email, event } = await req.json();

  if (!email || !event) {
    return NextResponse.json(
      { error: "email and event required" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (event === "installed" || event === "login") {
    await createOrUpdateHubSpotContact({
      email,
      extension_installed: true,
    });

    if (event === "installed") {
      await triggerLoopsEvent(email, "extension_installed");
      await updateLoopsContact(email, { extensionInstalled: true });
    }
  }

  if (user_id) {
    await supabase
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", user_id);
  }

  return NextResponse.json({ success: true });
}
