import { NextRequest, NextResponse } from "next/server";
import { normalizeContactIdentifier } from "@/lib/contact-identifiers";
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
  identifiers: Array<{ platform: string; identifier: string; label?: string | null; confirmed?: boolean | null }>
) {
  const seen = new Set<string>();
  return identifiers.filter((item) => {
    const key = `${item.platform}:${item.identifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeText(primary: string | null, duplicate: string | null) {
  const first = primary?.trim();
  const second = duplicate?.trim();
  if (!first) return second || null;
  if (!second || first.includes(second)) return first;
  return `${first}\n\n${second}`;
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
    .select("platform, identifier, label, confirmed")
    .eq("user_id", userId)
    .eq("contact_id", duplicateContactId);

  if (identifiersError) return NextResponse.json({ error: identifiersError.message }, { status: 500 });

  const duplicateLegacyIdentifiers = [
    normalizeContactIdentifier({ platform: "email", identifier: duplicate.email, label: "Email", confirmed: true }),
    normalizeContactIdentifier({
      platform: "slack",
      identifier: duplicate.slack_handle,
      label: "Slack handle",
      confirmed: false,
    }),
    normalizeContactIdentifier({ platform: "phone", identifier: duplicate.phone_number, label: "Phone", confirmed: true }),
  ].filter(Boolean) as Array<{ platform: string; identifier: string; label?: string | null; confirmed?: boolean | null }>;

  const identifiersToMove = uniqueIdentifiers([
    ...(duplicateIdentifiers || []),
    ...duplicateLegacyIdentifiers,
  ]);

  if (identifiersToMove.length) {
    const movedIdentifiers = identifiersToMove.map((item) => ({
      contact_id: primaryContactId,
      user_id: userId,
      platform: item.platform,
      identifier: item.identifier,
      label: item.label || null,
      confirmed: item.confirmed ?? item.platform !== "slack",
    }));

    const { error: upsertError } = await supabase
      .from("contact_identifiers")
      .upsert(movedIdentifiers, { onConflict: "user_id,platform,identifier" });

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: primaryInsight } = await supabase
    .from("contact_insights")
    .select("*")
    .eq("contact_id", primaryContactId)
    .maybeSingle();

  const { data: duplicateInsight } = await supabase
    .from("contact_insights")
    .select("*")
    .eq("contact_id", duplicateContactId)
    .maybeSingle();

  if (!primaryInsight && duplicateInsight) {
    await supabase
      .from("contact_insights")
      .update({ contact_id: primaryContactId })
      .eq("contact_id", duplicateContactId);
  } else if (primaryInsight && duplicateInsight) {
    await supabase
      .from("contact_insights")
      .update({
        summary: mergeText(primaryInsight.summary, duplicateInsight.summary),
        communication_patterns: mergeText(primaryInsight.communication_patterns, duplicateInsight.communication_patterns),
        common_topics: mergeText(primaryInsight.common_topics, duplicateInsight.common_topics),
        tone_trend: mergeText(primaryInsight.tone_trend, duplicateInsight.tone_trend),
        responsiveness: mergeText(primaryInsight.responsiveness, duplicateInsight.responsiveness),
        generated_at: new Date().toISOString(),
      })
      .eq("contact_id", primaryContactId);
  }

  const { data: primarySummary } = await supabase
    .from("contact_relationship_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("contact_id", primaryContactId)
    .maybeSingle();

  const { data: duplicateSummary } = await supabase
    .from("contact_relationship_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("contact_id", duplicateContactId)
    .maybeSingle();

  if (!primarySummary && duplicateSummary) {
    await supabase
      .from("contact_relationship_summaries")
      .update({ contact_id: primaryContactId, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("contact_id", duplicateContactId);
  } else if (primarySummary && duplicateSummary) {
    await supabase
      .from("contact_relationship_summaries")
      .update({
        communication_style: mergeText(primarySummary.communication_style, duplicateSummary.communication_style),
        recurring_tension_points: mergeText(
          primarySummary.recurring_tension_points,
          duplicateSummary.recurring_tension_points
        ),
        what_tends_to_work: mergeText(primarySummary.what_tends_to_work, duplicateSummary.what_tends_to_work),
        unresolved_topics: mergeText(primarySummary.unresolved_topics, duplicateSummary.unresolved_topics),
        last_interaction_at: primarySummary.last_interaction_at || duplicateSummary.last_interaction_at,
        generated_from: mergeText(primarySummary.generated_from, duplicateSummary.generated_from),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("contact_id", primaryContactId);
  }

  await supabase
    .from("interaction_summaries")
    .update({ contact_id: primaryContactId })
    .eq("user_id", userId)
    .eq("contact_id", duplicateContactId);

  const { error: deleteError } = await supabase
    .from("contacts")
    .delete()
    .eq("id", duplicateContactId)
    .eq("user_id", userId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ contact: mergedContact });
}
