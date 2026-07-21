import { NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import { callAdaptiveModel, type AdaptiveSnapshot } from '@/lib/openai-adaptive'

function parseOpeningSuggestions(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const candidate = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) return { openingLine: '', keyAsk: '' }
  try {
    const parsed = JSON.parse(candidate) as { openingLine?: unknown; keyAsk?: unknown }
    return {
      openingLine: typeof parsed.openingLine === 'string' ? parsed.openingLine.trim() : '',
      keyAsk: typeof parsed.keyAsk === 'string' ? parsed.keyAsk.trim() : '',
    }
  } catch {
    return { openingLine: '', keyAsk: '' }
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response

  const { data: row, error } = await supabase
    .from('adaptive_conversation_sessions')
    .select('id, setup_snapshot')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !row) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })

  const snapshot = row.setup_snapshot as AdaptiveSnapshot
  const channelGuidance = snapshot.channel === 'phone'
    ? 'This is a phone call. Start with the kind of brief greeting and warmth someone would use when the other person answers (for example, “Hey, how are you?” or “Hi, it’s good to catch you”), then make a natural bridge toward the topic. Do not lead with the request or a formal agenda; the user should have room for a little human chit-chat first.'
    : 'This is a written conversation. Keep the opening natural for a message and avoid sounding like a formal agenda or a pasted setup summary.'
  const instructions = `You are Beckett drafting two separate lines for a workplace conversation practice session.

Return only valid JSON with exactly this shape: {"openingLine":"...","keyAsk":"..."}

openingLine: write the natural first line the user could actually say to the person. Use the approved setup as private context, but do not assume the user's feelings, intent, or preferred solution. For a phone call, include a brief greeting or warmth before bridging toward the topic. For text, sound natural for a written message. Keep it conversational and concise (8-24 words).

keyAsk: write the substantive request the user is practicing, using clear language they could say after the opener. Preserve useful request content from the situation and goal; this is where the direct ask belongs, not in the warm opener. Keep it specific and concise (8-30 words). Do not make the simulated person ask or accomplish the user's goal. Do not invent facts, use corporate filler, or write coaching commentary. These are suggested language options, not predictions of the other person's response.

${channelGuidance}`
  const input = JSON.stringify({
    channel: snapshot.channel,
    person: snapshot.person,
    situation: snapshot.situation,
    goal: snapshot.goal,
    concern: snapshot.concern,
    relationshipContext: snapshot.relationshipContext,
    personStyle: snapshot.personStyle,
    constraints: snapshot.constraints,
  })

  try {
    const suggestions = parseOpeningSuggestions(await callAdaptiveModel(instructions, input, 260))
    if (!suggestions.openingLine || !suggestions.keyAsk) throw new Error('The simulator returned invalid opening suggestions.')
    return NextResponse.json(suggestions)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The opening line could not be generated.' }, { status: 502 })
  }
}
