import { NextRequest, NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import { callAdaptiveModel } from '@/lib/openai-adaptive'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('setup_snapshot, transcript, status')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  if (row.status !== 'active') return NextResponse.json({ error: 'This session is no longer active.' }, { status: 409 })
  const snapshot = row.setup_snapshot as { person?: string; situation?: string; goal?: string }
  const transcript = Array.isArray(row.transcript) ? row.transcript : []
  const text = await callAdaptiveModel(
    `You are Beckett, helping a user pause a realistic conversation simulation. Do not continue role-play. Give concise, practical coaching based only on the transcript. Name one thing to notice and one possible next move. Do not claim to predict the real person. Return plain text in 2-4 sentences.`,
    `Person: ${snapshot.person || 'the other person'}\nSituation: ${snapshot.situation || 'not specified'}\nGoal: ${snapshot.goal || 'not specified'}\nTranscript: ${JSON.stringify(transcript)}`,
    300,
  )
  return NextResponse.json({ help: text.trim() })
}
