import { NextRequest, NextResponse } from "next/server";
import { createOrUpdateHubSpotContact, createHubSpotDeal } from "@/lib/hubspot";

export async function POST(req: NextRequest) {
  const { action, contact, deal } = await req.json();

  if (action === "sync_contact") {
    const id = await createOrUpdateHubSpotContact(contact);
    return NextResponse.json({ id });
  }

  if (action === "create_deal") {
    const id = await createHubSpotDeal(deal);
    return NextResponse.json({ id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
