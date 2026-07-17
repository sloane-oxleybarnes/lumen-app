import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { data, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('id, scenario_type, difficulty, status, lifecycle, setup_snapshot, transcript, assessment, created_at, updated_at, completed_at')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  return NextResponse.json({ session: data })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response
  const { error } = await supabase
    .from('adaptive_conversation_sessions')
    .delete()
    .eq('id', params.id)
    .eq('user_id', session.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
