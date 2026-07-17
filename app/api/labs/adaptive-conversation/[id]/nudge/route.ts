import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import { callAdaptiveModel, nudgeInstructions, parseAdaptiveNudge } from '@/lib/openai-adaptive'
import type { AdaptiveSnapshot, AdaptiveState } from '@/lib/adaptive-conversation'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('setup_snapshot, simulation_state, transcript, status')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  if (row.status !== 'active') return NextResponse.json({ shouldNudge: false })
  const transcript = Array.isArray(row.transcript) ? row.transcript : []
  if (transcript.filter((item: { role?: string }) => item.role === 'user').length < 2) return NextResponse.json({ shouldNudge: false })
  try {
    const result = parseAdaptiveNudge(await callAdaptiveModel(nudgeInstructions(), `Scenario: ${JSON.stringify(row.setup_snapshot as AdaptiveSnapshot)}\nState: ${JSON.stringify(row.simulation_state as AdaptiveState)}\nTranscript: ${JSON.stringify(transcript)}`, 350))
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ shouldNudge: false })
  }
}
