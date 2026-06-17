export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function callAnthropic(system: string | null, messages: AnthropicMessage[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured.')

  const body: Record<string, unknown> = {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
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
  return data.content.map((block) => block.text || '').join('')
}
