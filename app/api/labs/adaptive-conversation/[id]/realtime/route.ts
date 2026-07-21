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
  const snapshot = row.setup_snapshot as AdaptiveSnapshot
  const goalBoundary = `Critical simulation boundary: the user's goal is private practice context, not shared knowledge. Do not infer it, mention it, initiate it, or accomplish it for the user. Never ask them out, propose drinks or hanging out, offer the requested outcome, or manufacture mutual interest before the user explicitly raises that topic. Once they raise it, respond only to their actual wording as the simulated person; do not coach, complete, or take over their ask.`
  const form = new FormData()
  form.set('sdp', sdp)
  form.set('session', JSON.stringify({
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: `${realtimeInstructions(snapshot)}\n\n${goalBoundary}`,
    audio: {
      // The client explicitly creates the single opening greeting. Keeping
      // automatic response creation off prevents an empty/ambient audio buffer
      // from producing a second unsolicited greeting before the user speaks.
      input: { turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true }, transcription: { model: 'gpt-realtime-whisper' } },
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
