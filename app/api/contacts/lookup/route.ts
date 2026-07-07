import { NextRequest, NextResponse } from 'next/server'
import { normalizeContactIdentifier } from '@/lib/contact-identifiers'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getExtensionUserId } from '@/lib/extension-auth'

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const extUserId = await getExtensionUserId(req)
  if (extUserId) return extUserId
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user.id ?? null
}

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const platform = req.nextUrl.searchParams.get('platform')
  const identifier = req.nextUrl.searchParams.get('identifier')
  const name = req.nextUrl.searchParams.get('name')?.trim()

  const normalized = normalizeContactIdentifier({ platform, identifier })
  if (!normalized) {
    return NextResponse.json({ error: 'platform and identifier required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('contact_identifiers')
    .select('contact_id, platform, identifier, confirmed, contacts(id, name, trusted)')
    .eq('user_id', userId)
    .eq('platform', normalized.platform)
    .eq('identifier', normalized.identifier)
    .maybeSingle()

  if (!data && name) {
    const { data: nameMatch } = await supabase
      .from('contacts')
      .select('id, name, trusted')
      .eq('user_id', userId)
      .ilike('name', name)
      .limit(1)
      .maybeSingle()

    if (nameMatch) {
      return NextResponse.json({
        contact: null,
        suggestion: nameMatch,
        match: { confidence: 'suggested_name', platform: normalized.platform },
      })
    }
    return NextResponse.json({ contact: null })
  }

  if (!data) return NextResponse.json({ contact: null })

  const contact = (Array.isArray(data.contacts) ? data.contacts[0] : data.contacts) as { id: string; name: string; trusted: boolean } | null
  const isConfirmedSlackUser = normalized.platform === 'slack_user_id' && data.confirmed
  const isSuggestedSlackHandle = normalized.platform === 'slack'
  if (isSuggestedSlackHandle) {
    return NextResponse.json({
      contact: null,
      suggestion: contact,
      match: { confidence: 'suggested_identifier', platform: normalized.platform },
    })
  }

  return NextResponse.json({
    contact,
    suggestion: null,
    match: {
      confidence: isConfirmedSlackUser || data.confirmed ? 'confirmed' : 'identifier',
      platform: normalized.platform,
    },
  })
}
