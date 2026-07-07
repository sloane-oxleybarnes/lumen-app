import { NextRequest, NextResponse } from 'next/server'
import { upsertRelationshipSummary } from '@/lib/contact-relationship-context'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getExtensionUserId } from '@/lib/extension-auth'

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const extUserId = await getExtensionUserId(req)
  if (extUserId) return extUserId
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user.id ?? null
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json() as { content: { text?: string }[] }
  return data.content.map((b) => b.text || '').join('').trim()
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createSupabaseServerClient()

  // Verify ownership and get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, email, slack_handle, relationship_type, relationship_other, notes, trusted')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()

  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const prompt = `You are a relationship intelligence assistant. Based on the following contact profile, generate a brief relationship insight. Be warm, specific, and actionable. Format your response as a JSON object with these exact keys: summary, communication_patterns, common_topics, tone_trend, responsiveness.

Contact: ${contact.name}
Email: ${contact.email || 'not provided'}
Slack handle: ${contact.slack_handle || 'not provided'}
Relationship: ${contact.relationship_type === 'Other' ? contact.relationship_other || 'Other' : contact.relationship_type || 'not provided'}
Trusted contact: ${contact.trusted ? 'yes' : 'no'}
Notes: ${contact.notes || 'none'}

Respond with only the JSON object, no markdown wrapping.`

  let insights: Record<string, string>
  try {
    const raw = await callClaude(prompt)
    insights = JSON.parse(raw.replace(/^```json?\n?/, '').replace(/\n?```$/, ''))
  } catch {
    return NextResponse.json({ error: 'failed to generate insights' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('contact_insights')
    .upsert({
      contact_id: params.id,
      summary: insights.summary,
      communication_patterns: insights.communication_patterns,
      common_topics: insights.common_topics,
      tone_trend: insights.tone_trend,
      responsiveness: insights.responsiveness,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const relationshipSummary = await upsertRelationshipSummary({
    userId,
    contactId: params.id,
    communicationStyle: insights.communication_patterns || insights.summary,
    recurringTensionPoints: insights.tone_trend,
    whatTendsToWork: insights.responsiveness,
    unresolvedTopics: insights.common_topics,
    generatedFrom: 'contact_profile',
  }).catch(() => null)

  return NextResponse.json({ insights: data, relationshipSummary })
}
