import { NextRequest, NextResponse } from "next/server";

// Stripe webhook — stubbed, not live yet
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  // TODO: verify signature and handle events when Stripe goes live
  console.log("Stripe webhook received (stub)", { sig, bodyLength: body.length });

  return NextResponse.json({ received: true });
}
