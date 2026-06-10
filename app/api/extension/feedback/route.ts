import { NextRequest, NextResponse } from "next/server";
import { getExtensionProfile } from "@/lib/extension-auth";
import { supabaseAdmin } from "@/lib/server-admin";
import { trackBetaEvent } from "@/lib/beta-events";

type FeedbackBody = {
  feedback?: "yes" | "no";
  improvementNote?: string;
  responseText?: string;
  mode?: string;
  context?: {
    platform?: string;
    sender?: string;
    senderEmail?: string;
    thread?: Array<{
      sender?: string;
      senderEmail?: string;
      timestamp?: string;
      body?: string;
      text?: string;
      isCurrentUser?: boolean;
    }>;
  };
  metadata?: Record<string, unknown> & {
    source?: string;
    threadCount?: number;
  };
  result?: Record<string, unknown>;
};

function truncate(value: unknown, max = 4000) {
  if (typeof value !== "string") return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function snapshotContext(context: FeedbackBody["context"]) {
  const thread = Array.isArray(context?.thread) ? context.thread : [];
  return {
    platform: context?.platform || null,
    thread: thread.slice(-30).map((message) => ({
      sender: truncate(message.sender, 200),
      senderEmail: truncate(message.senderEmail, 200),
      timestamp: truncate(message.timestamp, 200),
      isCurrentUser: Boolean(message.isCurrentUser),
      body: truncate(message.body || message.text || "", 2000),
    })),
  };
}

export async function POST(req: NextRequest) {
  const profile = await getExtensionProfile(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as FeedbackBody;
  if (body.feedback !== "yes" && body.feedback !== "no") {
    return NextResponse.json({ error: "feedback must be yes or no" }, { status: 400 });
  }

  const contextSnapshot = snapshotContext(body.context);
  const threadCount =
    typeof body.metadata?.threadCount === "number"
      ? body.metadata.threadCount
      : contextSnapshot.thread.length;

  const { error } = await supabaseAdmin.from("beta_feedback").insert({
    user_id: profile.id,
    rating: body.feedback,
    comment: truncate(body.improvementNote, 4000),
    platform: truncate(body.context?.platform || null, 100),
    mode: truncate(body.mode || null, 100),
    source: truncate(body.metadata?.source || null, 100),
    thread_count: threadCount,
    sender: truncate(body.context?.sender || null, 300),
    sender_email: truncate(body.context?.senderEmail || null, 300),
    response_text: truncate(body.responseText, 4000),
    analysis_result: body.result || {},
    context_snapshot: contextSnapshot,
    metadata: body.metadata || {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await trackBetaEvent({
    userId: profile.id,
    email: profile.email,
    eventName: "feedback_submitted",
    source: "extension",
    metadata: {
      rating: body.feedback,
      platform: body.context?.platform || null,
      mode: body.mode || null,
      feedbackSource: body.metadata?.source || null,
      threadCount,
    },
  });

  return NextResponse.json({ ok: true });
}
