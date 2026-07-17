import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import { realtimeInstructions } from '@/lib/openai-adaptive'
import type { AdaptiveSnapshot } from '@/lib/adaptive-conversation'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const sdp = await req.text()
  if (!sdp.trim()) return NextResponse.json({ error: 'WebRTC session description is required.' }, { status: 400 })
  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('setup_snapshot')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Realtime voice is not configured.' }, { status: 503 })
  const form = new FormData()
  form.set('sdp', sdp)
  form.set('session', JSON.stringify({
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: realtimeInstructions(row.setup_snapshot as AdaptiveSnapshot),
    audio: {
      input: { turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true }, transcription: { model: 'gpt-realtime-whisper' } },
      output: { voice: 'marin' },
    },
  }))
  const safetyIdentifier = createHash('sha256').update(session.user.id).digest('hex').slice(0, 32)
  const realtimeResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'OpenAI-Safety-Identifier': safetyIdentifier },
    body: form,
  })
  const answer = await realtimeResponse.text()
  if (!realtimeResponse.ok) return NextResponse.json({ error: answer || 'Realtime voice session could not be created.' }, { status: 502 })
  return new Response(answer, { status: 200, headers: { 'Content-Type': 'application/sdp' } })
}
