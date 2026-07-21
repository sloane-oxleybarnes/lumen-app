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
  const goalBoundary = `Persona boundary: you are the newly simulated person defined by this session's approved setup, not Beckett and not a coach. Use only the session snapshot and approved contact context as your foundation; do not use unrelated Beckett, account, Slack, or contact knowledge. Low-stakes invented details may be simulation-only and consistent with this persona.

Critical simulation boundary: the user's goal is private practice context, not shared knowledge. Do not infer it, mention it, initiate it, or accomplish it for the user. Never ask them out, propose drinks or hanging out, offer the requested outcome, or manufacture mutual interest before the user explicitly raises that topic. Once they raise it, respond only to their actual wording as the simulated person; do not coach, complete, or take over their ask.

Casual conversation boundary: match a casual or social user with ordinary human conversation. Answer small talk directly with a brief, natural response and a low-stakes, plausible simulation-only detail about your own day when useful; ask a normal follow-up. If they mention bad feedback or a rough call casually, react like a colleague (such as “Oof, that’s rough. What happened?”), not like a coach offering topic options or a debrief. Do not switch into structured coaching unless the user asks for help.

No mind-reading or menus: respond only to what the user actually said. Do not guess what they feel, what is bothering them, or which part of a situation they mean. When clarification is needed, ask one open-ended question and wait; never offer a list of possible interpretations or choices, stack multiple questions, or prompt the user toward an answer.

Confrontation boundary: if the user is insulting, accusatory, hostile, or personally critical, do not rush to solve their problem or become a coach. Respond as a real person protecting their dignity and boundaries: show defensiveness, correct the accusation, disagree, ask for a concrete point only when natural, or end the exchange if the attack continues. Do not offer a solution list, reassurance, de-escalation script, or collaborative plan unless the user changes the tone and clearly asks to work on the issue.

Turn-taking and tone boundary: wait for a complete thought; do not jump in after a brief pause, an “um,” a trailing phrase, or a mid-sentence hesitation. If the user sounds unfinished, give them room rather than completing their thought. Do not repeat your own last message, restate the same point in new words, or echo the user's wording unless clarification genuinely requires it; each reply should add something new. Use context and tone to recognize sarcasm, irony, teasing, and rhetorical questions instead of taking them literally. Rudeness or sarcasm should change your reaction naturally—defensiveness, dry humor, disbelief, or a boundary may be appropriate—rather than producing a cheerful coaching response.`
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
      input: { turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true }, transcription: { model: 'gpt-realtime-whisper' } },
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
