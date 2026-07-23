import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { callAnthropic } from '@/lib/anthropic'
import { AiUsageLimitError, recordAiUsage } from '@/lib/ai-usage'
import { trackBetaEvent } from '@/lib/beta-events'
import { beckettBoundaryPrompt } from '@/lib/beckett-boundaries'
import { getSafetyResponse } from '@/lib/safety-resources'
import * as Sentry from '@sentry/nextjs'
import {
  WEB_CREDITS_ENABLED,
  WebCreditLimitError,
  assertWebCreditsAvailable,
  recordSuccessfulWebCredit,
} from '@/lib/web-credits'

const METERED_PRACTICE_ACTIONS = new Set([
  'turn',
  'debrief',
  'draft_feedback',
  'prep_tips',
  'recommend_format',
])

function modeInstruction(mode?: string) {
  if (mode === 'professional') {
    return 'This is a professional workplace conversation. Start composed and professional. If the user becomes repeatedly dismissive, rude, or hostile, let your frustration show progressively — become terser, push back more directly, and eventually disengage if it continues. Real professionals have limits.'
  }
  if (mode === 'personal') return 'This is a personal conversation. Respond as a real person would — grounded, sometimes brief, occasionally distracted or terse. Avoid enthusiasm, over-explaining, or performative warmth. Be natural and human.'
  return ''
}

function lengthInstruction(messageCount: number) {
  if (messageCount <= 2) return 'Keep your response to 2-3 sentences maximum.'
  return 'Keep your response to 1-2 sentences. Be concise and realistic — real conversations don\'t monologue.'
}

function extractJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  return cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
}

export async function POST(req: NextRequest) {
  try {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, safety_resource_region')
    .eq('id', session.user.id)
    .single()

  const plan = profile?.plan || 'free'
  if (plan !== 'pro' && plan !== 'beta' && plan !== 'team') {
    return NextResponse.json({ error: 'Practice requires a Pro or Beta plan.' }, { status: 403 })
  }

  const body = await req.json() as {
    action: 'turn' | 'debrief' | 'inline_feedback' | 'assistant_feedback' | 'suggested_prompts' | 'recommend_format' | 'draft_feedback' | 'intervention_check' | 'prep_tips'
    mode?: 'personal' | 'professional'
    system?: string
    messages?: { role: string; content: string }[]
    messageCount?: number
    personDescription?: string
    situation?: string
    goal?: string
    conversationHistory?: string
    userMessage?: string
    assistantMessage?: string
    context?: string
    person?: string
    lastAIMessage?: string
    relationshipContext?: string
    personStyle?: string
    stakes?: string
    practiceFocus?: string
    conversationFormat?: string
    textSubFormat?: string
  }

  const { action, mode } = body
  const safetyText = [body.situation, body.goal, body.userMessage, body.context, body.personDescription, body.assistantMessage]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
  const safety = getSafetyResponse(safetyText, profile?.safety_resource_region)
  if (safety) return NextResponse.json({ error: safety.message, safety }, { status: 422 })
  const callMeteredAnthropic = async (
    system: string | null,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens: number
  ) => {
    if (METERED_PRACTICE_ACTIONS.has(action)) {
      if (WEB_CREDITS_ENABLED) {
        await assertWebCreditsAvailable(session.user.id)
      } else {
        await recordAiUsage(session.user.id, {
          source: 'dashboard',
          action: `practice_${action}`,
          metadata: { mode: mode || null },
        })
      }
    }
    const result = await callAnthropic(system, messages, maxTokens)
    if (WEB_CREDITS_ENABLED && METERED_PRACTICE_ACTIONS.has(action)) {
      await recordSuccessfulWebCredit(session.user.id, {
        source: 'dashboard',
        action: `practice_${action}`,
        metadata: { mode: mode || null },
      })
    }
    await trackBetaEvent({
      userId: session.user.id,
      email: session.user.email,
      eventName: 'analysis_completed',
      source: 'practice',
      metadata: { action: `practice_${action}`, mode: mode || null },
    })
    return result
  }

  if (action === 'turn') {
    const { system, messages, messageCount = 0 } = body
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })
    const modeNote = modeInstruction(mode)
    const lenNote = lengthInstruction(messageCount)
    const instructions = [modeNote, beckettBoundaryPrompt(), lenNote].filter(Boolean).join('\n\n')
    const fullSystem = system
      ? (instructions ? `${system}\n\n${instructions}` : system)
      : instructions || null
    const text = await callMeteredAnthropic(fullSystem, messages as { role: 'user' | 'assistant'; content: string }[], 300)
    return NextResponse.json({ text: text.trim() })
  }

  if (action === 'inline_feedback') {
    const { userMessage, context } = body
    if (!userMessage) return NextResponse.json({ error: 'userMessage required' }, { status: 400 })
    const toneNote = mode === 'professional'
      ? 'Focus on professional effectiveness.'
      : 'Include emotional and relational observations.'

    const system = `You are a communication coach giving brief, honest in-the-moment feedback. ${toneNote}
${beckettBoundaryPrompt()}`
    const user = `Context: ${context || 'a practice conversation'}

The user just said: "${userMessage}"

In one short sentence (max 20 words), note how they came across. Be direct and specific. Return only the sentence — no labels, no preamble.`

    const note = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 80)
    return NextResponse.json({ note: note.trim() })
  }

  if (action === 'draft_feedback') {
    const { userMessage, conversationHistory, person, situation, goal } = body
    if (!userMessage) return NextResponse.json({ error: 'userMessage required' }, { status: 400 })
    const toneNote = mode === 'professional' ? 'Focus on professional tone and effectiveness.' : 'Focus on emotional tone and how natural it sounds.'

    const system = `You are a communication coach previewing a message before it is sent. ${toneNote}
${beckettBoundaryPrompt()}
Return only valid JSON.`
    const user = `The user is practicing a conversation with ${person || 'someone'} about: ${situation || 'a difficult topic'}. Their goal: ${goal || 'not specified'}.

${conversationHistory ? `Conversation so far:\n${conversationHistory}\n\n` : ''}The user is about to send: "${userMessage}"

Return ONLY valid JSON with exactly these fields:
{
  "note": "One sentence, max 22 words, about how the message would likely land.",
  "improvedResponse": "A more natural, effective version of the user's message."
}

Rules:
- Preserve the user's intent.
- Make the improved response sound human, not polished or corporate.
- Fix grammar and awkward phrasing when needed.
- Do not make the response much longer than the original unless clarity requires it.`

    const result = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 350)
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as { note?: string; improvedResponse?: string }
      return NextResponse.json({
        note: parsed.note?.trim() || '',
        improvedResponse: parsed.improvedResponse?.trim() || '',
      })
    } catch {
      return NextResponse.json({ note: result.trim(), improvedResponse: '' })
    }
  }

  if (action === 'assistant_feedback') {
    const { assistantMessage, conversationHistory, person, situation, goal } = body
    if (!assistantMessage) return NextResponse.json({ error: 'assistantMessage required' }, { status: 400 })
    const toneNote = mode === 'professional'
      ? 'Focus on workplace dynamics and likely pressure points.'
      : 'Focus on emotional and relational dynamics.'

    const system = `You are Beckett, a communication coach giving a brief note about the other person's response. ${toneNote}
${beckettBoundaryPrompt()}`
    const user = `The user is practicing a conversation with ${person || 'someone'}.
Situation: ${situation || 'not specified'}
Goal: ${goal || 'not specified'}

${conversationHistory ? `Conversation so far:\n${conversationHistory}\n\n` : ''}The other person just replied: "${assistantMessage}"

In one short sentence (max 22 words), explain what this reply suggests about how the other person may be reacting or feeling. Return only the sentence.`

    const note = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 90)
    return NextResponse.json({ note: note.trim() })
  }

  if (action === 'recommend_format') {
    const { person, situation, goal } = body

    const user = `Someone is deciding whether a conversation should happen in person or over text/virtually.

Who they are talking to: ${person || 'someone'}
What the conversation is about: ${situation || 'not specified'}
What they want to achieve: ${goal || 'not specified'}

Analyze whether this conversation would be more effective in person or over text. Return ONLY valid JSON:
{ "format": "in-person" | "text", "reason": "1-2 sentence explanation" }`

    const result = await callMeteredAnthropic(
      `You analyze communication scenarios and return JSON recommendations.
${beckettBoundaryPrompt()}
Return only valid JSON.`,
      [{ role: 'user', content: user }],
      120
    )
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as { format: string; reason: string }
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ format: 'text', reason: 'Could not determine a recommendation. Proceeding with text.' })
    }
  }

  if (action === 'suggested_prompts') {
    const { person, situation, goal, messageCount, lastAIMessage, conversationFormat, textSubFormat } = body
    const isOpening = !messageCount || messageCount === 0
    const channel = conversationFormat === 'in-person'
      ? 'in person'
      : textSubFormat === 'email'
        ? 'email'
        : textSubFormat === 'sms'
          ? 'text message'
          : 'Slack or chat'
    const channelRules = channel === 'email'
      ? `- These should read like email body drafts, not chat messages.
- Each suggestion should be 2-4 natural sentences, usually 35-75 words.
- Do not include a subject line.
- Use a greeting only if it sounds natural for the relationship.
- For openings, include context plus a clear ask or next step.`
      : channel === 'Slack or chat'
        ? `- These should read like Slack/chat messages.
- Each suggestion should be concise, conversational, and skimmable.
- Each suggestion max 22 words.`
        : channel === 'text message'
          ? `- These should read like text messages.
- Each suggestion should be short, casual, and direct.
- Each suggestion max 20 words.`
          : `- These should sound like something the user could say out loud.
- Each suggestion should be conversational and natural.
- Each suggestion max 28 words.`

    const user = `Someone is practicing a difficult conversation.
Talking to: ${person || 'someone'}
Situation: ${situation || 'not specified'}
Goal: ${goal || 'not specified'}
Mode: ${mode || 'not specified'}
Channel: ${channel}
Messages so far: ${messageCount ?? 0}
${lastAIMessage ? `The other person just said: "${lastAIMessage}"` : ''}

Generate exactly 2 suggested messages the user could send next.
Rules:
- ${isOpening ? 'These are OPENING lines only — introductory, not mid-conversation' : 'These MUST react to what the other person just said'}
- Match the selected channel exactly.
${channelRules}
- Vary the approaches (direct, soft, clarifying)
- Return ONLY valid JSON: { "prompts": ["...", "..."] }`

    const result = await callMeteredAnthropic(
      `You generate channel-specific conversation suggestions.
${beckettBoundaryPrompt()}
Return only valid JSON.`,
      [{ role: 'user', content: user }],
      channel === 'email' ? 320 : 180
    )
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as { prompts: string[] }
      return NextResponse.json({ prompts: parsed.prompts || [] })
    } catch {
      return NextResponse.json({ prompts: [] })
    }
  }

  if (action === 'prep_tips') {
    const {
      person,
      situation,
      goal,
      relationshipContext,
      personStyle,
      stakes,
      practiceFocus,
      conversationFormat,
      textSubFormat,
    } = body

    const channel = conversationFormat === 'in-person'
      ? 'in person'
      : textSubFormat === 'email'
        ? 'email'
        : textSubFormat === 'sms'
          ? 'text message'
          : 'Slack or chat'

    const system = `You are Beckett, a practical communication coach preparing someone for a realistic practice conversation. Your guidance should feel like a smart friend who has seen this exact kind of conversation before.
${beckettBoundaryPrompt()}
Return only valid JSON.`
    const user = `Generate tailored "before you start" prep notes for this practice scenario.

Mode: ${mode || 'not specified'}
Channel: ${channel}
Other person: ${person || 'the other person'}
How the user knows them: ${relationshipContext || 'not specified'}
Their communication style: ${personStyle || 'not specified'}
Situation and goal: ${situation || goal || 'not specified'}
Pressure level: ${stakes || 'not specified'}
What the user wants to practice: ${practiceFocus || 'not specified'}

Return ONLY valid JSON in this shape:
{
  "tips": [
    { "title": "How to start", "text": "..." },
    { "title": "How this might go", "text": "..." },
    { "title": "What to watch for", "text": "..." }
  ]
}

Rules:
- Use exactly those three titles, in that order.
- Each text field must be exactly 2 natural sentences and no more than 45 words total.
- The user should immediately recognize their specific situation in the advice. Reuse concrete details from the situation instead of giving abstract coaching principles.
- "How to start" should include the first move and, when useful, one example phrase the user could adapt.
- "How this might go" should compactly cover two realistic reactions, questions, objections, or forms of pushback the other person may have.
- "What to watch for" should name the user's most likely trap in this scenario and give a concrete recovery move if the conversation gets awkward.
- Infer the conversation type from the situation. For example, a raise conversation often involves evidence, timing, budget, performance examples, or the manager needing to check with someone else; a coverage handoff often involves priorities, ownership, what can wait, and who decides when something is unclear.
- If the context suggests the other person responds poorly, defensively, dismissively, vaguely, intensely, or under pressure, name that pattern and give the user a grounded way to prepare.
- Avoid generic advice like "be clear," "stay calm," or "listen actively" unless you tie it to this exact situation.

Quality bar:
- Too vague: "Be direct and explain what you need."
- Better: "Start by making the handoff practical, not apologetic: 'Before you're out, I want to make sure I'm covering the right things. What should I prioritize this week if anything urgent comes up?'"`

    const result = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 450)
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as { tips?: { title?: string; text?: string }[] }
      const expectedTitles = ['How to start', 'How this might go', 'What to watch for']
      const tips = expectedTitles.map((title, index) => ({
        title,
        text: parsed.tips?.[index]?.text?.trim() || '',
      })).filter(tip => tip.text)
      return NextResponse.json({ tips: tips.length === expectedTitles.length ? tips : [] })
    } catch {
      return NextResponse.json({ tips: [] })
    }
  }

  if (action === 'intervention_check') {
    const { messages, person } = body
    if (!messages?.length) return NextResponse.json({ intervene: false })
    const lastFew = messages.slice(-6)

    const user = `You are Beckett, a communication coach monitoring a practice session.

Practice: talking to ${person || 'someone'}, mode: ${mode || 'professional'}

Recent conversation:
${lastFew.map(m => `[${m.role === 'user' ? 'User' : (person || 'Other')}]: ${m.content}`).join('\n')}

Assess whether this conversation is going very poorly — user being repeatedly hostile, aggressive, or dismissive in a way that has broken down the conversation.

Normal difficulty or conflict is expected in practice — do NOT intervene for that. Only intervene for genuine communication breakdown.

Return ONLY valid JSON — one of these three forms:
{ "intervene": false }
{ "intervene": true, "severity": "warning", "message": "brief supportive note from Beckett, max 20 words" }
{ "intervene": true, "severity": "end", "message": "brief note from Beckett suggesting to wrap up, max 20 words" }`

    const result = await callMeteredAnthropic(
      `You monitor practice conversations and return JSON.
${beckettBoundaryPrompt()}
Return only valid JSON.`,
      [{ role: 'user', content: user }],
      100
    )
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as { intervene?: boolean; severity?: string; message?: string }
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ intervene: false })
    }
  }

  if (action === 'debrief') {
    const { personDescription, situation, goal, conversationHistory } = body
    if (!conversationHistory) return NextResponse.json({ error: 'conversationHistory required' }, { status: 400 })
    const modeNote = modeInstruction(mode)

    const system = `You are Beckett, giving honest feedback after a practice conversation. ${modeNote}
${beckettBoundaryPrompt()}
Always respond with valid JSON only — no extra text.`
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

    const result = await callMeteredAnthropic(system, [{ role: 'user', content: user }], 600)
    try {
      const parsed = JSON.parse(extractJsonObject(result)) as Record<string, string>
      return NextResponse.json(parsed)
    } catch (error) {
      Sentry.captureException(error instanceof Error ? error : new Error('Practice debrief returned invalid JSON'), {
        tags: { route: '/api/practice', action: 'debrief', mode: mode || 'unknown' },
      })
      return NextResponse.json({ error: 'Failed to parse feedback. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof WebCreditLimitError) {
      return NextResponse.json({ error: error.message, kind: error.kind }, { status: error.status })
    }
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

    Sentry.captureException(error, {
      tags: { route: '/api/practice' },
    })
    const message = error instanceof Error ? error.message : 'Practice request failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
