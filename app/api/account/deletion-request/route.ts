import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { notes?: string };
  const requestedAt = new Date().toISOString();
  const notes = body.notes?.trim() || null;

  const { error } = await supabase
    .from("profiles")
    .update({
      deletion_requested_at: requestedAt,
      deletion_status: "requested",
      deletion_notes: notes,
      updated_at: requestedAt,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails
      .send({
        from: "Beckett <hello@meetbeckett.co>",
        to: "hello@meetbeckett.co",
        subject: "Account deletion requested",
        html: `
          <p>A Beckett beta user requested account deletion.</p>
          <p><strong>Email:</strong> ${user.email || "unknown"}</p>
          <p><strong>User ID:</strong> ${user.id}</p>
          <p><strong>Requested at:</strong> ${requestedAt}</p>
          ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
        `,
      })
      .catch((emailError) => {
        console.error("Deletion request email error:", emailError);
      });
  }

  return NextResponse.json({ ok: true, requested_at: requestedAt });
}
