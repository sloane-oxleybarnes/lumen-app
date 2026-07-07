import { NextRequest, NextResponse } from "next/server";
import {
  buildContactIdentifierRows,
  ContactIdentifierInput,
  legacyPlatformsFromPatch,
} from "@/lib/contact-identifiers";
import { getExtensionUserId } from "@/lib/extension-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const extUserId = await getExtensionUserId(req)
  if (extUserId) return extUserId
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user.id ?? null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name?: string
    email?: string | null
    slack_handle?: string | null
    phone_number?: string | null
    relationship_type?: string | null
    relationship_other?: string | null
    notes?: string | null
    trusted?: boolean
    identifiers?: ContactIdentifierInput[]
  }

  const supabase = createSupabaseServerClient()

  // Ensure the contact belongs to this user
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, email, slack_handle, phone_number')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.email !== undefined) updates.email = body.email?.toLowerCase().trim() || null
  if (body.slack_handle !== undefined) updates.slack_handle = body.slack_handle?.trim() || null
  if (body.phone_number !== undefined) updates.phone_number = body.phone_number?.trim() || null
  if (body.relationship_type !== undefined) updates.relationship_type = body.relationship_type?.trim() || null
  if (body.relationship_other !== undefined) updates.relationship_other = body.relationship_other?.trim() || null
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null
  if (body.trusted !== undefined) updates.trusted = body.trusted

  let contact = existing
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    contact = data
  }

  const shouldReplaceIdentifiers = Array.isArray(body.identifiers)
  const legacyPlatforms = legacyPlatformsFromPatch(body)

  if (shouldReplaceIdentifiers) {
    const identifiers = buildContactIdentifierRows({
      contactId: params.id,
      userId,
      email: body.email !== undefined ? body.email : existing.email,
      slackHandle: body.slack_handle !== undefined ? body.slack_handle : existing.slack_handle,
      phoneNumber: body.phone_number !== undefined ? body.phone_number : existing.phone_number,
      identifiers: body.identifiers,
    })

    const { error: deleteError } = await supabase
      .from('contact_identifiers')
      .delete()
      .eq('contact_id', params.id)
      .eq('user_id', userId)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (identifiers.length) {
      const { error: upsertError } = await supabase
        .from('contact_identifiers')
        .upsert(identifiers, { onConflict: 'user_id,platform,identifier' })

      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
  } else if (legacyPlatforms.length) {
    const identifiers = buildContactIdentifierRows({
      contactId: params.id,
      userId,
      email: body.email,
      slackHandle: body.slack_handle,
      phoneNumber: body.phone_number,
    })

    const { error: deleteError } = await supabase
      .from('contact_identifiers')
      .delete()
      .eq('contact_id', params.id)
      .eq('user_id', userId)
      .in('platform', legacyPlatforms)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (identifiers.length) {
      const { error: upsertError } = await supabase
        .from('contact_identifiers')
        .upsert(identifiers, { onConflict: 'user_id,platform,identifier' })

      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ contact })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
