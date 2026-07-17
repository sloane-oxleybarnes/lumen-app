import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import {
  assessmentInstructions,
  callAdaptiveModel,
  parseAdaptiveAssessment,
  type AdaptiveSnapshot,
  type AdaptiveState,
} from '@/lib/openai-adaptive'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { data: row, error: loadError } = await supabase
    .from('adaptive_conversation_sessions')
    .select('id, status, setup_snapshot, simulation_state, transcript, assessment')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (loadError || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  if (row.assessment) return NextResponse.json({ assessment: row.assessment })

  const snapshot = row.setup_snapshot as AdaptiveSnapshot
  const state = row.simulation_state as AdaptiveState
  const transcript = Array.isArray(row.transcript) ? row.transcript : []
  if (transcript.length < 2) return NextResponse.json({ error: 'Have at least one exchange before finishing.' }, { status: 400 })
  const input = `Completed transcript:\n${JSON.stringify(transcript)}`
  let assessment
  try {
    assessment = parseAdaptiveAssessment(await callAdaptiveModel(assessmentInstructions(snapshot, state), input, 900))
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'The assessment could not be generated.'
    return NextResponse.json({ error: messageText }, { status: 502 })
  }
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('adaptive_conversation_sessions')
    .update({ assessment, status: 'completed', lifecycle: 'completed', completed_at: now, updated_at: now })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ assessment })
}
