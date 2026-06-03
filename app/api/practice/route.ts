import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function callAnthropic(system: string | null, messages: { role: string; content: string }[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured.')

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message || `Anthropic error ${res.status}`)
  }

  const data = await res.json() as { content: { text?: string }[] }
  return data.content.map((b) => b.text || '').join('')
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', session.user.id)
    .single()

  const plan = profile?.plan || 'free'
  if (plan !== 'pro' && plan !== 'beta') {
    return NextResponse.json({ error: 'Practice requires a Pro or Beta plan.' }, { status: 403 })
  }

  const body = await req.json() as {
    action: 'turn' | 'debrief' | 'inline_feedback'
    system?: string
    messages?: { role: string; content: string }[]
    personDescription?: string
    situation?: string
    goal?: string
    conversationHistory?: string
    userMessage?: string
    context?: string
  }

  const { action } = body

  if (action === 'turn') {
    const { system, messages } = body
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })
    const text = await callAnthropic(system || null, messages, 600)
    return NextResponse.json({ text: text.trim() })
  }

  if (action === 'inline_feedback') {
    const { userMessage, context } = body
    if (!userMessage) return NextResponse.json({ error: 'userMessage required' }, { status: 400 })

    const system = 'You are a communication coach giving brief, honest in-the-moment feedback.'
    const user = `Context: ${context || 'a practice conversation'}

The user just said: "${userMessage}"

In one short sentence (max 20 words), note how they came across. Be direct and specific. Return only the sentence — no labels, no preamble.`

    const note = await callAnthropic(system, [{ role: 'user', content: user }], 80)
    return NextResponse.json({ note: note.trim() })
  }

  if (action === 'debrief') {
    const { personDescription, situation, goal, conversationHistory } = body
    if (!conversationHistory) return NextResponse.json({ error: 'conversationHistory required' }, { status: 400 })

    const system = 'You are Beckett, giving honest feedback after a practice conversation. Always respond with valid JSON only — no extra text.'
    const user = `You were just playing the role of ${personDescription} in a practice conversation.
The situation: "${situation}"
The user's goal: "${goal}"

Here is the conversation:
${conversationHistory}

Now break character completely. Return a JSON object with exactly these 4 fields (each 1-2 sentences, honest but constructive):

{
  "other_person_felt": "How the other person likely felt during this conversation",
  "how_you_came_across": "How the user came across overall",
  "what_went_well": "One or two specific things that worked",
  "things_to_work_on": "The main thing to improve next time"
}

Return only valid JSON. No markdown, no extra text.`

    const result = await callAnthropic(system, [{ role: 'user', content: user }], 600)
    try {
      const parsed = JSON.parse(result.trim()) as Record<string, string>
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ error: 'Failed to parse feedback. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
