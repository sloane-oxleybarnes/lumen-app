import { NextRequest, NextResponse } from 'next/server'
import {
  lookupRelationshipContextByIdentifier,
  recordSafeInteractionSummary,
} from '@/lib/contact-relationship-context'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function callAnthropic(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured.')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json() as { content: { text?: string }[] }
  return data.content.map(b => b.text || '').join('').trim()
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const token = (session as unknown as { provider_token?: string }).provider_token
  if (!token) return NextResponse.json({ error: 'google_not_connected' })

  // Search Gmail for threads with this contact
  const query = encodeURIComponent(`from:${email} OR to:${email}`)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({})) as { error?: { status?: string } }
    if (err?.error?.status === 'UNAUTHENTICATED') return NextResponse.json({ error: 'google_not_connected' })
    return NextResponse.json({ error: 'gmail_error' })
  }

  const listData = await listRes.json() as { messages?: { id: string }[] }
  if (!listData.messages?.length) return NextResponse.json({ error: 'no_threads_found' })

  // Fetch snippets from first 8 messages
  const snippets: string[] = []
  await Promise.all(
    listData.messages.slice(0, 8).map(async (m) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!msgRes.ok) return
      const msgData = await msgRes.json() as { snippet?: string }
      if (msgData.snippet) snippets.push(msgData.snippet)
    })
  )

  if (!snippets.length) return NextResponse.json({ error: 'no_threads_found' })

  const summary = await callAnthropic(
    `Based on these email exchanges with someone, describe their communication style in 2-3 sentences. Focus on tone, directness, and how they prefer to receive information. Be specific and practical.

Email snippets:
${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return only the description — no preamble, no labels.`
  )

  const relationshipContext = await lookupRelationshipContextByIdentifier({
    userId: session.user.id,
    identifier: { platform: 'email', identifier: email, confirmed: true },
  })

  if (relationshipContext) {
    await recordSafeInteractionSummary({
      userId: session.user.id,
      contactId: relationshipContext.contact.id,
      platform: 'gmail',
      interactionType: 'requested_contact_context',
      summary,
      metadata: {
        source: 'gmail_contact_context',
        contact_email: email.toLowerCase().trim(),
      },
    }).catch((error) => {
      console.error('Gmail contact summary storage failed', error)
    })
  }

  return NextResponse.json({
    summary,
    contact: relationshipContext
      ? { id: relationshipContext.contact.id, name: relationshipContext.contact.name }
      : null,
  })
}
