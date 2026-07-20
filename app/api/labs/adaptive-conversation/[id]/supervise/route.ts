import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import {
  callAdaptiveModel,
  parseAdaptiveSupervision,
  realtimeInstructions,
  supervisionInstructions,
} from '@/lib/openai-adaptive'
import type { AdaptiveSnapshot, AdaptiveState, AdaptiveTranscriptItem } from '@/lib/adaptive-conversation'

/**
 * Uses GPT-5.6 as a private turn supervisor for live phone/video sessions.
 * The live audio/avatar transport remains provider-managed; this route owns
 * state, nudges, and (for phone) the next-turn Realtime instruction update.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('id, channel, setup_snapshot, simulation_state, transcript')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  if (row.channel !== 'phone' && row.channel !== 'video') {
    return NextResponse.json({ error: 'Live supervision is available only for phone and video sessions.' }, { status: 400 })
  }

  const snapshot = row.setup_snapshot as AdaptiveSnapshot
  const state = row.simulation_state as AdaptiveState
  const transcript = (Array.isArray(row.transcript) ? row.transcript : []) as AdaptiveTranscriptItem[]
  if (transcript.length < 2) return NextResponse.json({ shouldNudge: false, prompt: '', examples: [] })

  try {
    const result = parseAdaptiveSupervision(await callAdaptiveModel(
      supervisionInstructions(snapshot, state),
      `Transcript after the latest exchange:\n${JSON.stringify(transcript)}`,
      550,
    ))
    const existingState = row.simulation_state && typeof row.simulation_state === 'object' ? row.simulation_state as Record<string, unknown> : {}
    const nextState = { ...existingState, ...result.state }
    const { error: updateError } = await supabase
      .from('adaptive_conversation_sessions')
      .update({ simulation_state: nextState, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', session.user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      shouldNudge: Boolean(result.shouldNudge),
      prompt: result.prompt || '',
      examples: Array.isArray(result.examples) ? result.examples.slice(0, 2) : [],
      instructions: `${realtimeInstructions(snapshot)}\n\nPrivate supervisor update for the next turn: ${result.nextTurnGuidance || 'Continue naturally, matching the user and preserving the person\'s current limits and uncertainty.'}`,
      state: result.state,
    })
  } catch {
    return NextResponse.json({ shouldNudge: false, prompt: '', examples: [] })
  }
}
