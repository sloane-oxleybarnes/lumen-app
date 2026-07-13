import { NextRequest, NextResponse } from "next/server";
import { startGuestPracticeFromPrep } from "@/lib/slack-guest-practice";
import { verifySlackPracticeToken } from "@/lib/slack-practice-link";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = verifySlackPracticeToken(req.nextUrl.searchParams.get("token") || "");
  if (!payload) return new NextResponse("This Practice link is invalid or expired. Return to Slack and try again.", { status: 401 });
  try {
    const result = await startGuestPracticeFromPrep(payload);
    if (!result.ok || !result.permalink) {
      return new NextResponse("Beckett could not open the Practice thread. Return to the Prep thread and try again.", { status: 400 });
    }
    return NextResponse.redirect(result.permalink);
  } catch (error) {
    console.error("Slack Practice redirect failed", error);
    return new NextResponse("Beckett could not open the Practice thread. Return to the Prep thread and try again.", { status: 500 });
  }
}
