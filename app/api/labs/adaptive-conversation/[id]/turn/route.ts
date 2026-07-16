import { NextRequest, NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import {
  callAdaptiveModel,
  parseAdaptiveTurn,
  turnInstructions,
  type AdaptiveSnapshot,
  type AdaptiveState,
} from '@/lib/openai-adaptive'

type TranscriptItem = { role: 'user' | 'simulated_person'; content: string; turn: number; createdAt: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const body = await req.json().catch(() => null) as { message?: string } | null
  const message = body?.message?.trim() || ''
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const { data: row, error: loadError } = await supabase
    .from('adaptive_conversation_sessions')
    .select('id, status, setup_snapshot, simulation_state, transcript')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (loadError || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  if (row.status !== 'active') return NextResponse.json({ error: 'This session is no longer active.' }, { status: 409 })

  const snapshot = row.setup_snapshot as AdaptiveSnapshot
  const state = row.simulation_state as AdaptiveState
  const transcript = (Array.isArray(row.transcript) ? row.transcript : []) as TranscriptItem[]
  if (transcript.length >= 40) return NextResponse.json({ error: 'This conversation has reached its turn limit.' }, { status: 400 })

  const history = transcript.map((item) => `${item.role === 'user' ? 'User' : snapshot.person}: ${item.content}`).join('\n')
  const input = `${history ? `Conversation so far:\n${history}\n\n` : ''}User's latest message:\n${message}`
  let result
  try {
    result = parseAdaptiveTurn(await callAdaptiveModel(turnInstructions(snapshot, state), input, 700))
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'The simulator could not respond.'
    return NextResponse.json({ error: messageText }, { status: 502 })
  }

  const now = new Date().toISOString()
  const nextTranscript = [
    ...transcript,
    { role: 'user' as const, content: message, turn: transcript.filter((item) => item.role === 'user').length + 1, createdAt: now },
    { role: 'simulated_person' as const, content: result.reply.trim(), turn: transcript.filter((item) => item.role === 'user').length + 1, createdAt: now },
  ]
  const { error: updateError } = await supabase
    .from('adaptive_conversation_sessions')
    .update({ transcript: nextTranscript, simulation_state: result.state, updated_at: now })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ reply: result.reply.trim(), signals: result.signals || [], transcript: nextTranscript })
}
