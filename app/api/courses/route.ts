import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { callAnthropic } from '@/lib/anthropic'
import { AiUsageLimitError, recordAiUsage } from '@/lib/ai-usage'
import { trackBetaEvent } from '@/lib/beta-events'

export async function POST(req: NextRequest) {
  const diagnostic: { action?: string; courseId?: string | null; userId?: string } = {}
  try {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  diagnostic.userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', session.user.id)
    .single()

  const plan = profile?.plan || 'free'
  if (plan !== 'pro' && plan !== 'beta') {
    return NextResponse.json({ error: 'Courses require a Pro or Beta plan.' }, { status: 403 })
  }

  const body = await req.json() as {
    action: 'turn' | 'check_ghost' | 'ghost_analysis' | 'mini_convo' | 'draft_feedback' | 'debrief'
    system?: string
    messages?: { role: string; content: string }[]
    userMessage?: string
    draftContext?: string
    wrongAnswer?: string
    correctAnswer?: string
    scenario?: string
    explanation?: string
    matchName?: string
    matchDescription?: string
    conversationHistory?: string
    practiceKind?: 'dating' | 'workplace'
    courseId?: string
  }

  const { action } = body
  diagnostic.action = action
  diagnostic.courseId = body.courseId || null
  const callMeteredAnthropic = async (
    system: string | null,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens: number
  ) => {
    await recordAiUsage(session.user.id, {
      source: 'course',
      action: `course_${action}`,
    })
    const result = await callAnthropic(system, messages, maxTokens)
    await trackBetaEvent({
      userId: session.user.id,
      email: session.user.email,
      eventName: 'analysis_completed',
      source: 'course',
      metadata: { action: `course_${action}` },
    })
    return result
  }

  // ── Practice turn ──────────────────────────────────────────────────────
  if (action === 'turn') {
    const { system, messages } = body
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })
    const msgCount = messages.length
    const lengthNote = msgCount <= 2
      ? 'Keep your reply to 1-2 sentences — short and natural, like a real text message.'
      : 'Keep your reply to 1-2 sentences maximum. Real people text briefly.'
    const fullSystem = system ? `${system}\n\n${lengthNote}` : lengthNote
    const text = await callMeteredAnthropic(fullSystem, messages as { role: 'user' | 'assistant'; content: string }[], 150)
    return NextResponse.json({ text: text.trim().replace(/^[""“”]|[""“”]$/g, '') })
  }

  // ── Ghost check ────────────────────────────────────────────────────────
  if (action === 'check_ghost') {
    const { messages, matchName, practiceKind } = body
    if (practiceKind !== 'dating') return NextResponse.json({ ghost: false, hardIntervention: null })
    if (!messages?.length) return NextResponse.json({ ghost: false, hardIntervention: null })
    const lastFew = messages.slice(-8)

    const prompt = `You are assessing a dating app conversation from the perspective of ${matchName || 'the match'}.

Last messages:
${lastFew.map(m => `[${m.role === 'user' ? 'Them' : matchName || 'Match'}]: ${m.content}`).join('\n')}

Would ${matchName || 'the match'} realistically stop responding (ghost) based on how the conversation has gone?
Only return ghost:true if there is clear evidence the conversation has gone poorly — not just awkward or slow.
Return hardIntervention if the user said something harassing, explicitly sexual, threatening, or deeply inappropriate.

Return ONLY valid JSON: { "ghost": boolean, "hardIntervention": null | "brief 1-sentence Beckett note about what happened (max 25 words)" }`

    const result = await callMeteredAnthropic(
      'You assess dating app conversations. Return only valid JSON.',
      [{ role: 'user', content: prompt }],
      100
    )
    try {
      return NextResponse.json(JSON.parse(result.trim()))
    } catch {
      return NextResponse.json({ ghost: false, hardIntervention: null })
    }
  }

  // ── Ghost analysis (Beckett debrief on why they were ghosted) ──────────
  if (action === 'ghost_analysis') {
    const { conversationHistory, matchName, practiceKind } = body
    if (practiceKind !== 'dating') return NextResponse.json({ analysis: '' })
    const prompt = `A person was practicing asking someone out on a dating app. Their match (${matchName || 'Jamie'}) stopped responding — they were ghosted.

Conversation:
${conversationHistory || 'No conversation provided'}

As Beckett, write 2-3 sentences of honest, compassionate analysis of why the conversation went the way it did. Focus on what patterns led here and what to try differently. Do not sugarcoat but do not be harsh. Return only the sentences.`

    const note = await callMeteredAnthropic(
      'You are Beckett, a communication coach. Be honest and constructive.',
      [{ role: 'user', content: prompt }],
      150
    )
    return NextResponse.json({ analysis: note.trim() })
  }

  // ── Mini-conversation (consequence preview for guided practice) ─────────
  if (action === 'mini_convo') {
    const { wrongAnswer, scenario, explanation, matchName, practiceKind } = body
    const isDating = practiceKind === 'dating'

    const prompt = `Generate a short realistic ${isDating ? 'dating app' : 'workplace'} conversation (3-4 exchanges) showing what would happen if someone sent a less effective message.

Context: ${scenario || (isDating ? 'asking someone out on a dating app' : 'asking for clarity at work')}
The message they sent: "${wrongAnswer}"
Why it is a problem: ${explanation || 'not ideal'}

Format: alternate between [User] and [${matchName || (isDating ? 'Jamie' : 'Jordan')}]. Start with the user sending the message. Show the realistic consequence — ${isDating ? 'the match becoming less engaged, more noncommittal, or giving a polite brush-off' : 'the other person needing to ask for clarification or giving an answer that still leaves the task unclear'}. Keep each message 1-2 sentences. Stay realistic, not dramatic.

Return ONLY valid JSON: { "messages": [{ "role": "user" | "assistant", "content": "..." }] }`

    const result = await callMeteredAnthropic(
      `You generate realistic ${isDating ? 'dating app' : 'workplace'} conversation previews. Return only valid JSON.`,
      [{ role: 'user', content: prompt }],
      400
    )
    try {
      const parsed = JSON.parse(result.trim()) as { messages: { role: string; content: string }[] }
      return NextResponse.json({ messages: parsed.messages || [] })
    } catch {
      return NextResponse.json({ messages: [] })
    }
  }

  // ── Draft feedback (slide 5 draft input) ──────────────────────────────
  if (action === 'draft_feedback') {
    const { userMessage, draftContext } = body
    if (!userMessage) return NextResponse.json({ error: 'userMessage required' }, { status: 400 })

    const context = draftContext || 'The user is practicing asking someone out on a dating app.'
    const note = await callMeteredAnthropic(
      `You are Beckett, a communication coach. ${context}`,
      [{ role: 'user', content: `The user wrote: "${userMessage}"\n\nIn one sentence (max 20 words), give honest specific feedback on this message. Return only the sentence.` }],
      80
    )
    return NextResponse.json({ note: note.trim() })
  }

  // ── Debrief ────────────────────────────────────────────────────────────
  if (action === 'debrief') {
    const { conversationHistory, matchName, matchDescription, practiceKind } = body
    if (!conversationHistory) return NextResponse.json({ error: 'conversationHistory required' }, { status: 400 })

    const isDating = practiceKind === 'dating'
    const system = `You are Beckett, giving honest feedback after a ${isDating ? 'dating app' : 'workplace'} practice conversation. Always respond with valid JSON only — no extra text.`
    const user = `You were playing the role of ${matchName || (isDating ? 'a dating app match' : 'the other person')} (${matchDescription || (isDating ? 'a dating app match' : 'a workplace conversation partner')}) in a practice conversation.

Here is the conversation:
${conversationHistory}

Break character completely. Return a JSON object with exactly these 4 fields (each 1-2 sentences, honest but constructive):

{
  "other_person_felt": "How the match likely felt during this conversation",
  "how_you_came_across": "How the user came across overall",
  "what_went_well": "One or two specific things that worked",
  "things_to_work_on": "The main thing to improve next time"
}

Return only valid JSON. No markdown, no extra text.`

    const result = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 500)
    try {
      return NextResponse.json(JSON.parse(result.trim()))
    } catch {
      return NextResponse.json({ error: 'Failed to parse feedback. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Course API failure', {
      action: diagnostic.action || 'unknown',
      courseId: diagnostic.courseId || null,
      userId: diagnostic.userId || null,
      status: error instanceof AiUsageLimitError ? error.status : 500,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    if (error instanceof AiUsageLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          limit: error.limit,
          remaining: error.remaining,
          unlimitedBypassConfigured: error.unlimitedBypassConfigured,
        },
        { status: error.status }
      )
    }

    const message = error instanceof Error ? error.message : 'Course request failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
