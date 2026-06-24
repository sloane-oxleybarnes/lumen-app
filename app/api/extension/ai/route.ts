import { NextRequest, NextResponse } from 'next/server'
import { callAnthropic, type AnthropicMessage } from '@/lib/anthropic'
import { AiUsageLimitError, recordAiUsage } from '@/lib/ai-usage'
import { getExtensionProfile } from '@/lib/extension-auth'
import { trackBetaEvent } from '@/lib/beta-events'
import { beckettBoundaryPrompt } from '@/lib/beckett-boundaries'

type ExtensionAiAction =
  | 'analyze_message'
  | 'draft_from_scratch'
  | 'ask_about_context'
  | 'meeting_brief'
  | 'meeting_debrief'
  | 'practice_turn'
  | 'practice_debrief'

type ExtensionAiBody = {
  action: ExtensionAiAction
  system?: string | null
  prompt?: string
  messages?: AnthropicMessage[]
  maxTokens?: number
  responseFormat?: 'json' | 'text'
  metadata?: Record<string, unknown>
}

function clampMaxTokens(value?: number) {
  if (!value || !Number.isFinite(value)) return 900
  return Math.max(100, Math.min(Math.floor(value), 1800))
}

function extractJson(text: string) {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI response was not valid JSON.')
    return JSON.parse(match[0])
  }
}

export async function POST(req: NextRequest) {
  const profile = await getExtensionProfile(req)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = profile.plan || 'free'
  if (plan !== 'beta' && plan !== 'pro') {
    return NextResponse.json({ error: 'Beta access required.' }, { status: 403 })
  }

  try {
    const body = await req.json() as ExtensionAiBody
    const { action, system = null, prompt, responseFormat = 'text', metadata } = body

    if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

    const messages = body.messages?.length
      ? body.messages
      : prompt
        ? [{ role: 'user' as const, content: prompt }]
        : []

    if (!messages.length) return NextResponse.json({ error: 'prompt or messages required' }, { status: 400 })

    const usage = await recordAiUsage(profile.id, {
      source: 'extension',
      action,
      metadata: {
        responseFormat,
        ...metadata,
      },
    })

    const systemWithBoundaries = system
      ? system.includes('Relationship-at-work guidance')
        ? system
        : `${system}\n\n${beckettBoundaryPrompt()}`
      : beckettBoundaryPrompt()
    const text = await callAnthropic(systemWithBoundaries, messages, clampMaxTokens(body.maxTokens))
    const cleaned = text.trim()

    await trackBetaEvent({
      userId: profile.id,
      email: profile.email,
      eventName: 'analysis_completed',
      source: 'extension',
      metadata: {
        action,
        responseFormat,
        platform: metadata?.platform || null,
        mode: metadata?.mode || null,
        source: metadata?.source || null,
        contextSource: metadata?.contextSource || null,
        contextStatus: metadata?.contextStatus || null,
        contextFailureReason: metadata?.contextFailureReason || null,
        threadCount: typeof metadata?.threadCount === 'number' ? metadata.threadCount : null,
      },
    })

    if (responseFormat === 'json') {
      return NextResponse.json({ result: extractJson(cleaned), usage })
    }

    return NextResponse.json({ text: cleaned, usage })
  } catch (error) {
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

    const message = error instanceof Error ? error.message : 'AI request failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
