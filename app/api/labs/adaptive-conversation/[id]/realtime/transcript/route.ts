import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import type { AdaptiveTranscriptItem } from '@/lib/adaptive-conversation'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const body = await req.json().catch(() => null) as { role?: 'user' | 'simulated_person'; content?: string } | null
  const content = body?.content?.trim() || ''
  if (!content || !body?.role) return NextResponse.json({ error: 'Transcript content is required.' }, { status: 400 })
  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('transcript')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  const transcript = (Array.isArray(row.transcript) ? row.transcript : []) as AdaptiveTranscriptItem[]
  const normalizedContent = content.replace(/\s+/g, ' ').toLowerCase()
  const duplicate = [...transcript].reverse().find((item) => item.role === body.role && item.content.replace(/\s+/g, ' ').toLowerCase() === normalizedContent)
  if (duplicate) return NextResponse.json({ transcript })
  const now = new Date().toISOString()
  const turn = body.role === 'user' ? transcript.filter((item) => item.role === 'user').length + 1 : Math.max(1, transcript.filter((item) => item.role === 'user').length)
  const nextTranscript = [...transcript, { role: body.role, content, turn, createdAt: now }]
  const { error: updateError } = await supabase
    .from('adaptive_conversation_sessions')
    .update({ transcript: nextTranscript, updated_at: now })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ transcript: nextTranscript })
}
