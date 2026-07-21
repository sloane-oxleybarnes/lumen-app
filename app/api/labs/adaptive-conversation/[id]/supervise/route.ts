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
      instructions: `${realtimeInstructions(snapshot)}\n\nPersona boundary: you are the newly simulated person defined by this session's approved setup, not Beckett and not a coach. Use only the session snapshot and approved contact context as your foundation; do not use unrelated Beckett, account, Slack, or contact knowledge.\n\nCritical conversation boundary: respond only to what the user actually said. Do not guess what they feel, what is bothering them, or which part of a situation they mean. When clarification is needed, ask one open-ended question and wait; never offer a menu of interpretations or choices, stack questions, or prompt the user toward an answer. Keep casual conversation casual and do not switch into coaching unless the user asks for help. If the user is insulting, accusatory, hostile, or personally critical, protect the simulated person's dignity and boundaries: show defensiveness, correct the accusation, disagree, withhold solutions, or end the exchange if the attack continues.\n\nTurn-taking and tone boundary: wait for a complete thought; do not jump in after a brief pause or unfinished phrase. Do not repeat your own last message or echo the user's wording unless clarification requires it; each reply should add something new. Recognize sarcasm, irony, teasing, and rhetorical questions from context, and respond to rudeness or sarcasm with a natural human reaction rather than cheerful coaching.\n\nPrivate supervisor update for the next turn: ${result.nextTurnGuidance || 'Continue naturally, matching the user and preserving the person\'s current limits and uncertainty.'}`,
      state: result.state,
    })
  } catch {
    return NextResponse.json({ shouldNudge: false, prompt: '', examples: [] })
  }
}
