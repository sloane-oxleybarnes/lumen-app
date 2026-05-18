import { NextRequest, NextResponse } from "next/server";
import { addLoopsContact, triggerLoopsEvent, updateLoopsContact } from "@/lib/loops";

export async function POST(req: NextRequest) {
  const { action, email, eventName, properties, contactData } = await req.json();

  if (action === "add_contact") {
    await addLoopsContact({ email, ...contactData });
    return NextResponse.json({ success: true });
  }

  if (action === "trigger_event") {
    await triggerLoopsEvent(email, eventName, properties);
    return NextResponse.json({ success: true });
  }

  if (action === "update_contact") {
    await updateLoopsContact(email, properties);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
