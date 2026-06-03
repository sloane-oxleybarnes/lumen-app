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
  // Auth check
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
    action: 'turn' | 'debrief'
    system?: string
    messages?: { role: string; content: string }[]
    personDescription?: string
    situation?: string
    goal?: string
    conversationHistory?: string
  }

  const { action } = body

  if (action === 'turn') {
    const { system, messages } = body
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })
    const text = await callAnthropic(system || null, messages, 600)
    return NextResponse.json({ text: text.trim() })
  }

  if (action === 'debrief') {
    const { personDescription, situation, goal, conversationHistory } = body
    if (!conversationHistory) return NextResponse.json({ error: 'conversationHistory required' }, { status: 400 })

    const system = 'You are Beckett, giving honest feedback after a practice conversation.'
    const user = `You were just playing the role of ${personDescription} in a practice conversation.
The situation: "${situation}"
The user's goal: "${goal}"

Here is the conversation that just happened:
${conversationHistory}

Now break character completely. Give the user honest, constructive feedback:
1. What landed well (1-2 specific moments)
2. One thing to rephrase (be specific — quote what they said and suggest an alternative)
3. One alternative approach they could try

Keep it under 150 words. Be honest but encouraging.`

    const result = await callAnthropic(system, [{ role: 'user', content: user }], 800)
    return NextResponse.json({ result: result.trim() })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
