import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import {
  assessmentInstructions,
  callAdaptiveModel,
  parseAdaptiveAssessment,
  adaptiveAssessmentResponseFormat,
  type AdaptiveSnapshot,
  type AdaptiveState,
  type AdaptiveAssessment,
} from '@/lib/openai-adaptive'

function fallbackAssessment(transcript: Array<{ role: string; content: string; turn: number }>): AdaptiveAssessment {
  const firstUser = transcript.find((item) => item.role === 'user')
  const firstPerson = firstUser
    ? transcript.find((item) => item.role === 'simulated_person' && item.turn === firstUser.turn)
    : undefined
  const lastUser = [...transcript].reverse().find((item) => item.role === 'user')
  const lastPerson = lastUser
    ? [...transcript].reverse().find((item) => item.role === 'simulated_person' && item.turn === lastUser.turn)
    : undefined
  const exchangeCount = new Set(transcript.map((item) => item.turn)).size

  return {
    summary: 'The conversation ended. Review the transcript below for the other person\'s reactions and the points where the exchange shifted.',
    openingLine: firstUser && firstPerson ? { user: firstUser.content, person: firstPerson.content } : null,
    whatWorked: exchangeCount > 0 ? [`You completed ${exchangeCount} exchange${exchangeCount === 1 ? '' : 's'} in this practice.`] : [],
    turningPoints: lastUser && lastPerson
      ? [{ turn: lastUser.turn, userSaid: lastUser.content, personSaid: lastPerson.content, why: 'This was the final exchange before the conversation ended.' }]
      : [],
    resistance: { increased: [], reduced: [] },
    goalProgress: 'A full assessment was not available, so use the transcript to review what moved the conversation forward and what remained unresolved.',
    replayPoint: null,
  }
}

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
    const instructions = assessmentInstructions(snapshot, state)
    try {
      assessment = parseAdaptiveAssessment(await callAdaptiveModel(instructions, input, 1600, adaptiveAssessmentResponseFormat))
    } catch {
      // A bounded retry handles transient truncation or an interrupted model response
      // without making the user restart a completed phone conversation.
      assessment = parseAdaptiveAssessment(await callAdaptiveModel(instructions, input, 2000, adaptiveAssessmentResponseFormat))
    }
  } catch (error) {
    console.error('Adaptive assessment generation failed; using transcript fallback.', error)
    assessment = fallbackAssessment(transcript)
  }
  if (snapshot.channel !== 'text') assessment.replayPoint = null
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('adaptive_conversation_sessions')
    .update({ assessment, status: 'completed', lifecycle: 'completed', completed_at: now, updated_at: now })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ assessment })
}
