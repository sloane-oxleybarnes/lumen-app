import { ContactIdentifierInput, normalizeContactIdentifier } from "@/lib/contact-identifiers";
import { supabaseAdmin } from "@/lib/server-admin";

type ContactMatch = {
  id: string;
  name: string;
  notes: string | null;
  trusted: boolean;
  relationship_type: string | null;
  relationship_other: string | null;
};

type RelationshipSummary = {
  communication_style: string | null;
  recurring_tension_points: string | null;
  what_tends_to_work: string | null;
  unresolved_topics: string | null;
  generated_from: string | null;
  updated_at: string | null;
};

export type ContactRelationshipContext = {
  contact: ContactMatch;
  identifierConfirmed: boolean;
  promptContext: string;
};

function relationshipLabel(contact: ContactMatch) {
  if (contact.relationship_type === "Other") return contact.relationship_other || "Other";
  return contact.relationship_type || null;
}

function formatRelationshipPromptContext(contact: ContactMatch, summary: RelationshipSummary | null) {
  const lines = [
    `Matched Beckett contact: ${contact.name}.`,
    relationshipLabel(contact) ? `Relationship: ${relationshipLabel(contact)}.` : null,
    contact.trusted ? "This is marked as a trusted contact." : null,
    contact.notes ? `User-editable relationship notes: ${contact.notes}` : null,
    summary?.communication_style ? `Communication style: ${summary.communication_style}` : null,
    summary?.recurring_tension_points ? `Common friction: ${summary.recurring_tension_points}` : null,
    summary?.what_tends_to_work ? `Preferred approach: ${summary.what_tends_to_work}` : null,
    summary?.unresolved_topics ? `Unresolved topics: ${summary.unresolved_topics}` : null,
  ].filter(Boolean);

  if (!lines.length) return "";
  return [
    "Relationship context from Beckett Contacts. Treat this as helpful background, not proof of current intent.",
    ...lines,
  ].join("\n");
}

export async function lookupRelationshipContextByIdentifier({
  userId,
  identifier,
  requireConfirmed = false,
}: {
  userId: string;
  identifier: ContactIdentifierInput;
  requireConfirmed?: boolean;
}): Promise<ContactRelationshipContext | null> {
  const normalized = normalizeContactIdentifier(identifier);
  if (!normalized) return null;

  const { data: identifierRow, error } = await supabaseAdmin
    .from("contact_identifiers")
    .select("contact_id, confirmed")
    .eq("user_id", userId)
    .eq("platform", normalized.platform)
    .eq("identifier", normalized.identifier)
    .maybeSingle();

  if (error || !identifierRow?.contact_id) return null;
  if (requireConfirmed && !identifierRow.confirmed) return null;

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, name, notes, trusted, relationship_type, relationship_other")
    .eq("user_id", userId)
    .eq("id", identifierRow.contact_id)
    .maybeSingle();

  if (!contact) return null;

  const { data: summary } = await supabaseAdmin
    .from("contact_relationship_summaries")
    .select("communication_style, recurring_tension_points, what_tends_to_work, unresolved_topics, generated_from, updated_at")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .maybeSingle();

  return {
    contact: contact as ContactMatch,
    identifierConfirmed: Boolean(identifierRow.confirmed),
    promptContext: formatRelationshipPromptContext(contact as ContactMatch, (summary as RelationshipSummary | null) || null),
  };
}

export async function recordSafeInteractionSummary({
  userId,
  contactId,
  platform,
  interactionType,
  summary,
  toneObserved,
  userResponsePattern,
  suggestedFollowup,
  metadata = {},
  updateRelationshipSummary = true,
}: {
  userId: string;
  contactId: string;
  platform: string;
  interactionType: string;
  summary: string;
  toneObserved?: string | null;
  userResponsePattern?: string | null;
  suggestedFollowup?: string | null;
  metadata?: Record<string, unknown>;
  updateRelationshipSummary?: boolean;
}) {
  const occurredAt = new Date().toISOString();

  await supabaseAdmin.from("interaction_summaries").insert({
    user_id: userId,
    contact_id: contactId,
    platform,
    interaction_type: interactionType,
    summary,
    tone_observed: toneObserved || null,
    user_response_pattern: userResponsePattern || null,
    suggested_followup: suggestedFollowup || null,
    occurred_at: occurredAt,
    metadata,
  });

  if (!updateRelationshipSummary) return;

  await supabaseAdmin.from("contact_relationship_summaries").upsert(
    {
      user_id: userId,
      contact_id: contactId,
      communication_style: summary,
      last_interaction_at: occurredAt,
      generated_from: platform,
      updated_at: occurredAt,
    },
    { onConflict: "user_id,contact_id" }
  );
}

export async function upsertRelationshipSummary({
  userId,
  contactId,
  communicationStyle,
  recurringTensionPoints,
  whatTendsToWork,
  unresolvedTopics,
  generatedFrom,
}: {
  userId: string;
  contactId: string;
  communicationStyle?: string | null;
  recurringTensionPoints?: string | null;
  whatTendsToWork?: string | null;
  unresolvedTopics?: string | null;
  generatedFrom: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("contact_relationship_summaries")
    .upsert(
      {
        user_id: userId,
        contact_id: contactId,
        communication_style: communicationStyle || null,
        recurring_tension_points: recurringTensionPoints || null,
        what_tends_to_work: whatTendsToWork || null,
        unresolved_topics: unresolvedTopics || null,
        generated_from: generatedFrom,
        updated_at: now,
      },
      { onConflict: "user_id,contact_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
