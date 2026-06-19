import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ContactRow = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  slack_handle: string | null;
  phone_number: string | null;
  relationship_type: string | null;
  relationship_other: string | null;
  notes: string | null;
  trusted: boolean;
};

function mergeNotes(primary: string | null, duplicate: string | null) {
  const first = primary?.trim();
  const second = duplicate?.trim();
  if (!first) return second || null;
  if (!second || first.includes(second)) return first;
  return `${first}\n\nMerged note:\n${second}`;
}

function uniqueIdentifiers(
  identifiers: Array<{ platform: string; identifier: string }>
) {
  const seen = new Set<string>();
  return identifiers.filter((item) => {
    const key = `${item.platform}:${item.identifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    primaryContactId?: string;
    duplicateContactId?: string;
  };

  const primaryContactId = body.primaryContactId?.trim();
  const duplicateContactId = body.duplicateContactId?.trim();

  if (!primaryContactId || !duplicateContactId) {
    return NextResponse.json({ error: "primaryContactId and duplicateContactId are required" }, { status: 400 });
  }

  if (primaryContactId === duplicateContactId) {
    return NextResponse.json({ error: "Choose two different contacts to merge" }, { status: 400 });
  }

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", userId)
    .in("id", [primaryContactId, duplicateContactId]);

  if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });

  const primary = (contacts as ContactRow[] | null)?.find((contact) => contact.id === primaryContactId);
  const duplicate = (contacts as ContactRow[] | null)?.find((contact) => contact.id === duplicateContactId);

  if (!primary || !duplicate) {
    return NextResponse.json({ error: "One or both contacts were not found" }, { status: 404 });
  }

  const updates: Partial<ContactRow> = {
    email: primary.email || duplicate.email || null,
    slack_handle: primary.slack_handle || duplicate.slack_handle || null,
    phone_number: primary.phone_number || duplicate.phone_number || null,
    relationship_type: primary.relationship_type || duplicate.relationship_type || null,
    relationship_other: primary.relationship_other || duplicate.relationship_other || null,
    notes: mergeNotes(primary.notes, duplicate.notes),
    trusted: primary.trusted || duplicate.trusted,
  };

  const { data: mergedContact, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", primaryContactId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: duplicateIdentifiers, error: identifiersError } = await supabase
    .from("contact_identifiers")
    .select("platform, identifier")
    .eq("user_id", userId)
    .eq("contact_id", duplicateContactId);

  if (identifiersError) return NextResponse.json({ error: identifiersError.message }, { status: 500 });

  const identifiersToMove = uniqueIdentifiers([
    ...(duplicateIdentifiers || []),
    duplicate.email ? { platform: "email", identifier: duplicate.email.toLowerCase().trim() } : null,
    duplicate.slack_handle ? { platform: "slack", identifier: duplicate.slack_handle.trim() } : null,
  ].filter(Boolean) as Array<{ platform: string; identifier: string }>);

  if (identifiersToMove.length) {
    const movedIdentifiers = identifiersToMove.map((item) => ({
      contact_id: primaryContactId,
      user_id: userId,
      platform: item.platform,
      identifier: item.identifier,
    }));

    const { error: upsertError } = await supabase
      .from("contact_identifiers")
      .upsert(movedIdentifiers, { onConflict: "user_id,platform,identifier" });

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: primaryInsight } = await supabase
    .from("contact_insights")
    .select("id")
    .eq("contact_id", primaryContactId)
    .maybeSingle();

  if (!primaryInsight) {
    await supabase
      .from("contact_insights")
      .update({ contact_id: primaryContactId })
      .eq("contact_id", duplicateContactId);
  }

  const { error: deleteError } = await supabase
    .from("contacts")
    .delete()
    .eq("id", duplicateContactId)
    .eq("user_id", userId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ contact: mergedContact });
}
