'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Phase = 'setup' | 'conversation' | 'debrief' | 'feedback'
type Mode = 'personal' | 'professional'
type ConversationFormat = 'text' | 'in-person' | 'not-sure'
type TextSubFormat = 'slack' | 'email' | 'sms' | 'not-sure'
type Message = { role: 'user' | 'assistant'; content: string }
type TrustedPerson = { id: string; name: string; relationship: string; communication_style: string; notes: string }
type ContactContext = { name: string; style: string; notes: string }
type DebriefData = { other_person_felt: string; how_you_came_across: string; what_went_well: string; things_to_work_on: string }
type PrepTip = { title: string; text: string }
type PracticeFeedbackRating = 'yes' | 'no'
type Intervention = { severity: 'warning' | 'end'; message: string }
type SavedSession = {
  id: string
  person: string
  situation: string
  goal: string
  mode: Mode
  conversationFormat: ConversationFormat
  textSubFormat: TextSubFormat
  emailSubject?: string
  relationshipContext?: string
  personStyle?: string
  recurringPattern?: string
  stakes?: string
  expectedResponse?: string
  practiceFocus?: string
  messages: Message[]
  savedAt: string
}

type ActiveSessionRow = {
  id: string
  session_data: Partial<SavedSession> & { phase?: Phase; setupStep?: number }
  updated_at: string
}

type PracticeContext = {
  relationshipContext: string
  personStyle: string
  recurringPattern: string
  stakes: string
  expectedResponse: string
  practiceFocus: string
}

const communicationStyleSuggestions = [
  'Direct and brief',
  'Warm and collaborative',
  'Detailed and analytical',
  'Fast-paced and reactive',
]

function isCustomCommunicationStyle(value: string) {
  return value.trim().length > 0 && !communicationStyleSuggestions.includes(value)
}

const stakesOptions = [
  'Low stakes',
  'Medium stakes',
  'High stakes',
  'High stakes and emotional',
]

const practiceFocusSuggestions = [
  'Help me start',
  'Help me stay direct',
  'Help me not over-explain',
  'Help me end with a clear ask',
]

function buildSystemPrompt(
  person: string,
  situation: string,
  goal: string,
  format: ConversationFormat,
  contact: ContactContext | null | undefined,
  mode: Mode,
  textSubFormat: TextSubFormat,
  practiceContext: PracticeContext
): string {
  let prompt = `You are playing the role of ${person} in a practice conversation.
The user is preparing to have this real conversation: "${situation}"
Their goal: "${goal}"`

  if (contact?.style) {
    prompt += `\n\nContext about ${person}: ${contact.style}`
    if (contact.notes) prompt += ` Additional notes: ${contact.notes}`
  }

  const contextLines = [
    practiceContext.relationshipContext ? `How the user knows them: ${practiceContext.relationshipContext}` : null,
    practiceContext.personStyle ? `Their communication style: ${practiceContext.personStyle}` : null,
    practiceContext.recurringPattern ? `What tends to happen with them: ${practiceContext.recurringPattern}` : null,
    practiceContext.stakes ? `Stakes/pressure level: ${practiceContext.stakes}` : null,
    practiceContext.expectedResponse ? `Likely response from them: ${practiceContext.expectedResponse}` : null,
    practiceContext.practiceFocus ? `Create realistic opportunities for the user to practice: ${practiceContext.practiceFocus}` : null,
  ].filter(Boolean)
  if (contextLines.length) {
    prompt += `\n\nAdditional context for roleplay:\n${contextLines.join('\n')}`
  }

  if (format === 'in-person') {
    prompt += `\n\nThis conversation would normally happen face to face. Play the role as you would in an in-person interaction.`
  }

  if (format === 'text') {
    if (textSubFormat === 'email') {
      prompt += `\n\nThis is an email exchange. Write only the email body — realistic length and tone for the relationship. No stage directions, no action descriptions, no narrative framing. Just the message text.`
    } else if (textSubFormat === 'slack') {
      prompt += `\n\nThis is a Slack DM conversation. Write only the message text — brief and conversational as Slack messages are. No formal greetings, no stage directions, no action descriptions.`
    } else if (textSubFormat === 'not-sure') {
      prompt += `\n\nThe user is not sure which channel this should happen in. Keep responses concise and realistic for a workplace practice chat. No stage directions or narrative framing.`
    } else {
      prompt += `\n\nThis is a text message (SMS) conversation. Write only the message text as it would be typed — short, casual, realistic. No stage directions, no descriptions of actions or body language, no narrative framing. Just the words.`
    }
  }

  if (mode === 'professional') {
    prompt += `\n\nStart as a composed professional. However, if the user is repeatedly dismissive, rude, or hostile, let your frustration show progressively — shorter responses, more direct pushback, eventually shutting down or disengaging if it continues. Real professionals have limits too.`
  }

  prompt += `\n\nStay in character throughout. Respond as this person realistically would — including appropriate resistance, questions, or emotional reactions. Do not be artificially easy or artificially difficult. Be realistic.

Never act as Beckett or as a communication coach during the roleplay. Do not evaluate the user's wording, praise their communication, suggest a better phrase, or ask them to try saying something differently. Do not mention practice, coaching, feedback, or the user's stated coaching target. Only respond as ${person}.`
  return prompt
}

function getChannelLabel(format: ConversationFormat, textSubFormat: TextSubFormat) {
  if (format === 'in-person') return 'in-person'
  if (textSubFormat === 'email') return 'email'
  if (textSubFormat === 'sms') return 'text message'
  return 'Slack'
}

function getChannelPhrase(format: ConversationFormat, textSubFormat: TextSubFormat) {
  const channel = getChannelLabel(format, textSubFormat)
  return channel === 'email' || channel === 'in-person'
    ? `an ${channel}`
    : `a ${channel}`
}

function cleanPreviewValue(value: string) {
  return value.trim().replace(/[.!?]+$/g, '')
}

function buildPracticePreview({
  person,
  relationshipContext,
  personStyle,
  situation,
  stakes,
  practiceFocus,
  conversationFormat,
  textSubFormat,
}: {
  person: string
  relationshipContext: string
  personStyle: string
  situation: string
  stakes: string
  practiceFocus: string
  conversationFormat: ConversationFormat
  textSubFormat: TextSubFormat
}) {
  const otherPerson = person.trim() || 'the other person'
  const channelPhrase = getChannelPhrase(conversationFormat, textSubFormat)
  const sentences = [`You will practice ${channelPhrase} conversation with ${otherPerson}.`]

  if (relationshipContext.trim()) {
    sentences.push(`Relationship context: ${cleanPreviewValue(relationshipContext)}.`)
  }
  if (personStyle.trim()) {
    sentences.push(`Their communication style: ${cleanPreviewValue(personStyle)}.`)
  }
  if (situation.trim()) {
    sentences.push(`Conversation focus: ${cleanPreviewValue(situation)}.`)
  }
  if (stakes.trim()) {
    sentences.push(`Pressure level: ${cleanPreviewValue(stakes)}.`)
  }
  if (practiceFocus.trim()) {
    sentences.push(`Beckett will watch for: ${cleanPreviewValue(practiceFocus)}.`)
  }

  return sentences
}

function buildPrepTips({
  person,
  personStyle,
  stakes,
  practiceFocus,
  conversationFormat,
  textSubFormat,
}: {
  person: string
  personStyle: string
  stakes: string
  practiceFocus: string
  conversationFormat: ConversationFormat
  textSubFormat: TextSubFormat
}): PrepTip[] {
  const otherPerson = person.trim() || 'the other person'
  const channel = getChannelLabel(conversationFormat, textSubFormat)
  const startTip =
    channel === 'email'
      ? 'Open with one clear sentence about why you are writing, then make the ask easy to find.'
      : channel === 'Slack'
        ? 'Start with a short context line, then ask one specific question or make one clear request.'
        : channel === 'text message'
          ? 'Keep the opener short and direct so the other person knows what you need from them.'
          : 'Start by naming the topic calmly, then pause long enough for them to respond.'

  const responseTip = personStyle.trim()
    ? `${otherPerson} may respond in a ${personStyle.trim().toLowerCase()} way, so give them one clear thing to react to.`
    : `${otherPerson} may ask for more context, push back, or need a moment before they understand what you are asking.`

  const watchTip = practiceFocus.trim()
    ? `Keep your attention on this: ${practiceFocus.trim()}.`
    : stakes.trim()
      ? `Because this feels ${stakes.trim().toLowerCase()}, watch for over-explaining or softening the ask too much.`
      : 'Watch whether your message includes the point, the reason, and the next step.'

  return [
    { title: 'How to start', text: startTip },
    { title: 'How this might go', text: responseTip },
    { title: 'What to watch for', text: watchTip },
  ]
}

function buildPrepTipsCacheKey({
  mode,
  person,
  relationshipContext,
  personStyle,
  situation,
  goal,
  stakes,
  practiceFocus,
  conversationFormat,
  textSubFormat,
}: {
  mode: Mode
  person: string
  relationshipContext: string
  personStyle: string
  situation: string
  goal: string
  stakes: string
  practiceFocus: string
  conversationFormat: ConversationFormat
  textSubFormat: TextSubFormat
}) {
  return JSON.stringify({
    mode,
    person: person.trim(),
    relationshipContext: relationshipContext.trim(),
    personStyle: personStyle.trim(),
    situation: situation.trim(),
    goal: goal.trim(),
    stakes: stakes.trim(),
    practiceFocus: practiceFocus.trim(),
    conversationFormat,
    textSubFormat,
  })
}

function buildLoadingPrepTips(fallbackTips: PrepTip[]) {
  return fallbackTips.map((tip) => ({
    title: tip.title,
    text: 'Tailoring this to your situation...',
  }))
}

// ── Contact overlay ────────────────────────────────────────────────────────

function ContactOverlay({
  onClose,
  onSelect,
  trustedPeople,
}: {
  onClose: () => void
  onSelect: (c: ContactContext) => void
  trustedPeople: TrustedPerson[]
}) {
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailResult, setGmailResult] = useState<string | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)

  async function loadGmailContext() {
    if (!gmailEmail.trim()) return
    setGmailLoading(true)
    setGmailError(null)
    setGmailResult(null)
    const res = await fetch(`/api/gmail/contact-context?email=${encodeURIComponent(gmailEmail)}`)
    const data = await res.json() as { summary?: string; error?: string }
    setGmailLoading(false)
    if (data.error === 'google_not_connected') {
      setGmailError('Connect Google in Settings to load email history.')
    } else if (data.error === 'no_threads_found') {
      setGmailError('No emails found with that address.')
    } else if (data.summary) {
      setGmailResult(data.summary)
    } else {
      setGmailError('Something went wrong. Try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium text-ink">Contact context</h2>
          <button onClick={onClose} className="text-ink-light hover:text-ink text-xl leading-none">×</button>
        </div>

        {trustedPeople.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Trusted People</p>
            <div className="space-y-2">
              {trustedPeople.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelect({ name: p.name, style: p.communication_style, notes: p.notes })}
                  className="w-full text-left border border-border rounded-card p-3 hover:border-primary transition-colors"
                >
                  <p className="text-sm font-medium text-ink">{p.name}</p>
                  {p.relationship && <p className="text-xs text-ink-light">{p.relationship}</p>}
                  {p.communication_style && (
                    <p className="text-xs text-ink-mid mt-1 line-clamp-2">{p.communication_style}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Email history</p>
          <p className="text-xs text-ink-mid mb-3">
            Enter their email address to load context from your recent exchanges.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              value={gmailEmail}
              onChange={e => setGmailEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadGmailContext() }}
              placeholder="their@email.com"
              className="flex-1 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={loadGmailContext}
              disabled={gmailLoading || !gmailEmail.trim()}
              className="bg-primary text-white text-sm rounded-pill px-4 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {gmailLoading ? '…' : 'Load'}
            </button>
          </div>
          {gmailError && (
            <p className="text-xs text-ink-mid mb-3">
              {gmailError}{' '}
              {gmailError.includes('Settings') && (
                <a href="/dashboard/settings" className="text-primary underline">Go to Settings</a>
              )}
            </p>
          )}
          {gmailResult && (
            <div className="bg-bg border border-border rounded-card p-3 mb-3">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-1">Communication style</p>
              <p className="text-sm text-ink leading-relaxed">{gmailResult}</p>
              <button
                onClick={() => onSelect({ name: gmailEmail, style: gmailResult, notes: '' })}
                className="mt-3 w-full bg-primary text-white text-sm rounded-pill py-2 hover:bg-primary-dark transition-colors"
              >
                Use this context
              </button>
            </div>
          )}
          {trustedPeople.length === 0 && !gmailResult && !gmailError && (
            <p className="text-xs text-ink-light">
              No Trusted People saved yet.{' '}
              <a href="/dashboard/trusted-people" className="text-primary underline">Add someone</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PracticePage() {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>('setup')
  const [setupStep, setSetupStep] = useState(0)
  const [mode, setMode] = useState<Mode>('professional')
  const [conversationFormat, setConversationFormat] = useState<ConversationFormat>('text')
  const [textSubFormat, setTextSubFormat] = useState<TextSubFormat>('slack')
  const [emailSubject, setEmailSubject] = useState('')
  const [person, setPerson] = useState('')
  const [situation, setSituation] = useState('')
  const [goal, setGoal] = useState('')
  const [relationshipContext, setRelationshipContext] = useState('')
  const [personStyle, setPersonStyle] = useState('')
  const [showCustomPersonStyle, setShowCustomPersonStyle] = useState(false)
  const [recurringPattern, setRecurringPattern] = useState('')
  const [stakes, setStakes] = useState('')
  const [expectedResponse, setExpectedResponse] = useState('')
  const [practiceFocus, setPracticeFocus] = useState('')
  const [contactContext, setContactContext] = useState<ContactContext | null>(null)
  const [showContactOverlay, setShowContactOverlay] = useState(false)
  const [trustedPeople, setTrustedPeople] = useState<TrustedPerson[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sentViaPrompt, setSentViaPrompt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const [draftImprovedResponse, setDraftImprovedResponse] = useState<string | null>(null)
  const [aiPrepTips, setAiPrepTips] = useState<PrepTip[] | null>(null)
  const [prepTipsLoading, setPrepTipsLoading] = useState(false)
  const [prepTipsCacheKey, setPrepTipsCacheKey] = useState('')
  const [error, setError] = useState('')
  const [limitNotice, setLimitNotice] = useState<string | null>(null)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [inlineFeedback, setInlineFeedback] = useState<Record<number, string>>({})
  const [assistantFeedback, setAssistantFeedback] = useState<Record<number, string>>({})
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])
  const [intervention, setIntervention] = useState<Intervention | null>(null)
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSessionCandidate, setActiveSessionCandidate] = useState<ActiveSessionRow | null>(null)
  const [practiceFeedbackRating, setPracticeFeedbackRating] = useState<PracticeFeedbackRating | null>(null)
  const [practiceFeedbackUseful, setPracticeFeedbackUseful] = useState('')
  const [practiceFeedbackOff, setPracticeFeedbackOff] = useState('')
  const [practiceFeedbackWouldUse, setPracticeFeedbackWouldUse] = useState('')
  const [practiceFeedbackSubmitting, setPracticeFeedbackSubmitting] = useState(false)
  const [practiceFeedbackSubmitted, setPracticeFeedbackSubmitted] = useState(false)
  const [practiceFeedbackError, setPracticeFeedbackError] = useState<string | null>(null)
  const [practiceAccess, setPracticeAccess] = useState<'loading' | 'allowed' | 'restricted'>('loading')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const maxHeight = phase === 'conversation' && conversationFormat === 'text' && textSubFormat === 'email' ? 220 : 160
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
    }
  }, [input, phase, conversationFormat, textSubFormat])

  useEffect(() => {
    localStorage.removeItem('beckett_practice_sessions')
    setSavedSessions([])
    async function loadPracticeAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setPracticeAccess('restricted')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle()
      setPracticeAccess(['beta', 'pro', 'team'].includes(profile?.plan || '') ? 'allowed' : 'restricted')
    }
    async function loadTrustedPeople() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('trusted_people')
          .select('id, name, relationship, communication_style, notes')
          .eq('user_id', user.id)
          .order('name')
        setTrustedPeople((data as TrustedPerson[]) || [])
      } catch { /* table may not exist yet */ }
    }
    loadPracticeAccess()
    loadTrustedPeople()
    async function loadActivePractice() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('practice_sessions')
        .select('id, session_data, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.session_data) setActiveSessionCandidate(data as ActiveSessionRow)
    }
    loadActivePractice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSuggestedPrompts = useCallback(async (lastAIMessage?: string, msgCount = 0) => {
    try {
      const effectiveGoal = goal || situation
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggested_prompts',
          mode,
          person,
          situation,
          goal: effectiveGoal,
          messageCount: msgCount,
          lastAIMessage,
          conversationFormat,
          textSubFormat,
        }),
      })
      const data = await res.json() as { prompts?: string[]; error?: string }
      if (!res.ok) {
        if (data.error) setLimitNotice(data.error)
        return
      }
      if (data.prompts?.length) setSuggestedPrompts(data.prompts)
    } catch { /* non-blocking */ }
  }, [mode, person, situation, goal, conversationFormat, textSubFormat])

  useEffect(() => {
    if (phase !== 'setup' || setupStep !== 3) return

    const cacheKey = buildPrepTipsCacheKey({
      mode,
      person,
      relationshipContext,
      personStyle,
      situation,
      goal,
      stakes,
      practiceFocus,
      conversationFormat,
      textSubFormat,
    })
    if (prepTipsCacheKey === cacheKey) return

    let cancelled = false
    setAiPrepTips(null)
    setPrepTipsLoading(true)

    async function loadPrepTips() {
      try {
        const res = await fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prep_tips',
            mode,
            person,
            relationshipContext,
            personStyle,
            situation,
            goal: goal || situation,
            stakes,
            practiceFocus,
            conversationFormat,
            textSubFormat,
          }),
        })
        const data = await res.json() as { tips?: PrepTip[] }
        if (!cancelled && res.ok && data.tips?.length === 3) {
          setAiPrepTips(data.tips)
        }
      } catch {
        // Fallback tips remain available if tailored prep cannot load.
      } finally {
        if (!cancelled) {
          setPrepTipsCacheKey(cacheKey)
          setPrepTipsLoading(false)
        }
      }
    }

    loadPrepTips()
    return () => { cancelled = true }
  }, [
    phase,
    setupStep,
    mode,
    person,
    relationshipContext,
    personStyle,
    situation,
    goal,
    stakes,
    practiceFocus,
    conversationFormat,
    textSubFormat,
    prepTipsCacheKey,
  ])

  async function getDraftFeedback() {
    if (!input.trim() || draftLoading) return
    setDraftLoading(true)
    setDraftNote(null)
    setDraftImprovedResponse(null)
    setLimitNotice(null)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : person}]: ${m.content}`).join('\n')
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft_feedback', mode, userMessage: input, conversationHistory: history, person, situation, goal }),
    })
    const data = await res.json() as { note?: string; improvedResponse?: string; error?: string }
    setDraftLoading(false)
    if (!res.ok) {
      setLimitNotice(data.error || 'Beckett could not generate feedback right now.')
      return
    }
    setDraftNote(data.note || null)
    setDraftImprovedResponse(data.improvedResponse || null)
  }

  function currentSessionData(nextMessages = messages, nextPhase: Phase = phase) {
    return {
      person,
      situation,
      goal,
      mode,
      conversationFormat,
      textSubFormat,
      emailSubject,
      relationshipContext,
      personStyle,
      recurringPattern,
      stakes,
      expectedResponse,
      practiceFocus,
      messages: nextMessages,
      phase: nextPhase,
      setupStep,
      savedAt: new Date().toISOString(),
    }
  }

  async function persistActivePractice(nextMessages = messages) {
    if (!activeSessionId) return
    await supabase
      .from('practice_sessions')
      .update({ session_data: currentSessionData(nextMessages, 'conversation'), updated_at: new Date().toISOString() })
      .eq('id', activeSessionId)
  }

  async function startPractice() {
    if (!person.trim()) {
      setSetupStep(0)
      setError('Please add the person you want to practice with.')
      return
    }
    if (!situation.trim()) {
      setSetupStep(1)
      setError('Please add the conversation you want help with.')
      return
    }
    if (!stakes.trim()) {
      setSetupStep(1)
      setError('Please choose how high-pressure this conversation feels.')
      return
    }
    if (!practiceFocus.trim()) {
      setSetupStep(2)
      setError('Please choose what you want Beckett to help you practice.')
      return
    }
    if (loading) return
    setLoading(true)
    setError('')
    setMessages([])
    setInlineFeedback({})
    setAssistantFeedback({})
    setDraftNote(null)
    setDraftImprovedResponse(null)
    setDebrief(null)
    setIntervention(null)
    setPracticeFeedbackRating(null)
    setPracticeFeedbackUseful('')
    setPracticeFeedbackOff('')
    setPracticeFeedbackWouldUse('')
    setPracticeFeedbackSubmitted(false)
    setPracticeFeedbackError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      setError('Please sign in again before starting practice.')
      return
    }
    const { data: created, error: createError } = await supabase
      .from('practice_sessions')
      .insert({
        user_id: user.id,
        person: person.trim(),
        situation: situation.trim(),
        goal: (goal || situation).trim(),
        status: 'active',
        mode,
        conversation_format: conversationFormat,
        text_sub_format: textSubFormat,
        session_data: currentSessionData([], 'conversation'),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    setLoading(false)
    if (createError || !created) {
      setError('Beckett could not save this practice session. Please try again.')
      return
    }
    setActiveSessionId(created.id)
    setActiveSessionCandidate(null)
    setPhase('conversation')
    setLimitNotice(null)
    loadSuggestedPrompts(undefined, 0)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    void persistActivePractice(next)
    setInput('')
    setDraftNote(null)
    setDraftImprovedResponse(null)
    setSuggestedPrompts([])
    setSentViaPrompt(false)
    setLoading(true)
    setLimitNotice(null)
    const effectiveGoal = goal || situation
    const system = buildSystemPrompt(
      person,
      situation,
      effectiveGoal,
      conversationFormat,
      contactContext,
      mode,
      textSubFormat,
      { relationshipContext, personStyle, recurringPattern, stakes, expectedResponse, practiceFocus }
    )
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'turn', mode, system, messages: next, messageCount: next.length }),
    })
    const data = await res.json() as { text?: string; error?: string }
    setLoading(false)
    if (data.text) {
      const aiMsg = data.text.replace(/^["""'']|["""'']$/g, '').trim()
      const withAI = [...next, { role: 'assistant' as const, content: aiMsg }]
      setMessages(withAI)
      void persistActivePractice(withAI)

      loadSuggestedPrompts(aiMsg, withAI.length)

      if (withAI.length >= 4) {
        fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'intervention_check', mode, messages: withAI, person }),
        })
          .then(r => r.json())
          .then((d: { intervene?: boolean; severity?: string; message?: string }) => {
            if (d.intervene && d.message) {
              setIntervention({ severity: (d.severity || 'warning') as 'warning' | 'end', message: d.message })
            }
          })
          .catch(() => {})
      }
    } else if (data.error) {
      setError(data.error)
      setLimitNotice(data.error)
    }
  }

  async function endAndDebrief() {
    setLoading(true)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : person}]: ${m.content}`).join('\n')
    const effectiveGoal = goal || situation
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'debrief', mode, personDescription: person, situation, goal: effectiveGoal, conversationHistory: history }),
    })
    const result = await res.json() as DebriefData & { error?: string }
    setLoading(false)
    if (result.error) { setError(result.error); return }

    if (activeSessionId) {
      await supabase
        .from('practice_sessions')
        .update({
          status: 'completed',
          debrief_summary: result,
          session_data: {
            person,
            situation,
            goal,
            mode,
            conversationFormat,
            textSubFormat,
            messageCount: messages.length,
            completedAt: new Date().toISOString(),
          },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeSessionId)
      setActiveSessionId(null)
    }

    setDebrief(result)
    setPhase('debrief')
  }

  async function submitPracticeFeedback() {
    if (!practiceFeedbackRating || practiceFeedbackSubmitting) return
    setPracticeFeedbackSubmitting(true)
    setPracticeFeedbackError(null)

    const comment = [
      practiceFeedbackUseful.trim() ? `Most useful: ${practiceFeedbackUseful.trim()}` : null,
      practiceFeedbackOff.trim() ? `Felt off: ${practiceFeedbackOff.trim()}` : null,
      practiceFeedbackWouldUse.trim() ? `Would use before real situation: ${practiceFeedbackWouldUse.trim()}` : null,
    ].filter(Boolean).join('\n\n')

    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: practiceFeedbackRating,
        comment,
        page: '/dashboard/practice',
        source: 'practice',
        metadata: {
          mode,
          conversationFormat,
          textSubFormat,
          person,
          situation,
          stakes,
          practiceFocus,
          messageCount: messages.length,
          useful: practiceFeedbackUseful.trim() || null,
          off: practiceFeedbackOff.trim() || null,
          wouldUse: practiceFeedbackWouldUse.trim() || null,
        },
      }),
    })

    setPracticeFeedbackSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setPracticeFeedbackError(data.error || 'Could not save feedback. Please try again.')
      return
    }

    setPracticeFeedbackSubmitted(true)
  }

  function loadSession(session: SavedSession) {
    setPerson(session.person)
    setSituation(session.situation)
    setGoal(session.goal)
    setMode(session.mode)
    setConversationFormat(session.conversationFormat)
    setTextSubFormat(session.textSubFormat)
    setEmailSubject(session.emailSubject || '')
    setRelationshipContext(session.relationshipContext || '')
    setPersonStyle(session.personStyle || '')
    setShowCustomPersonStyle(isCustomCommunicationStyle(session.personStyle || ''))
    setRecurringPattern(session.recurringPattern || '')
    setStakes(session.stakes || '')
    setExpectedResponse(session.expectedResponse || '')
    setPracticeFocus(session.practiceFocus || '')
    setMessages(session.messages)
    setInlineFeedback({})
    setAssistantFeedback({})
    setSuggestedPrompts([])
    setDraftNote(null)
    setDraftImprovedResponse(null)
    setIntervention(null)
    setError('')
    setPracticeFeedbackRating(null)
    setPracticeFeedbackUseful('')
    setPracticeFeedbackOff('')
    setPracticeFeedbackWouldUse('')
    setPracticeFeedbackSubmitted(false)
    setPracticeFeedbackError(null)
    setPhase('conversation')
  }

  function resumeActiveSession(row: ActiveSessionRow) {
    const session = row.session_data
    if (!session.person || !session.situation) return
    loadSession({
      id: row.id,
      person: session.person,
      situation: session.situation,
      goal: session.goal || '',
      mode: session.mode || 'professional',
      conversationFormat: session.conversationFormat || 'text',
      textSubFormat: session.textSubFormat || 'slack',
      emailSubject: session.emailSubject,
      relationshipContext: session.relationshipContext,
      personStyle: session.personStyle,
      recurringPattern: session.recurringPattern,
      stakes: session.stakes,
      expectedResponse: session.expectedResponse,
      practiceFocus: session.practiceFocus,
      messages: session.messages || [],
      savedAt: row.updated_at,
    })
    setActiveSessionId(row.id)
    setActiveSessionCandidate(null)
  }

  async function abandonActiveSession() {
    if (!activeSessionCandidate) return
    await supabase
      .from('practice_sessions')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', activeSessionCandidate.id)
    setActiveSessionCandidate(null)
    resetToSetup()
  }

  function resetToSetup() {
    setPhase('setup')
    setSetupStep(0)
    setMessages([])
    setDebrief(null)
    setInlineFeedback({})
    setAssistantFeedback({})
    setSuggestedPrompts([])
    setDraftNote(null)
    setDraftImprovedResponse(null)
    setIntervention(null)
    setError('')
    setEmailSubject('')
    setPracticeFeedbackRating(null)
    setPracticeFeedbackUseful('')
    setPracticeFeedbackOff('')
    setPracticeFeedbackWouldUse('')
    setPracticeFeedbackSubmitted(false)
    setPracticeFeedbackError(null)
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  if (practiceAccess === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading Practice access">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (practiceAccess === 'restricted') {
    return (
      <div className="w-full max-w-2xl">
        <h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Practice a conversation
        </h1>
        <p className="mb-6 text-sm text-ink-mid">Rehearse before the real thing with Beckett playing the other person.</p>
        <div className="rounded-card border border-primary/20 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Beta feature</p>
          <h2 className="mt-2 text-xl font-medium text-ink">Standalone Practice is not included on the Free plan.</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-mid">
            Free accounts can still use Beckett in Slack, Gmail, and Chrome within their coaching-credit limits,
            and can unlock two skill courses each month. Full standalone Practice is included during beta.
          </p>
          <Link href="/beta" className="mt-5 inline-block rounded-pill bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark">
            View beta access
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'setup') {
    const textSubFormatOptions: { value: TextSubFormat; label: string }[] = [
      { value: 'slack', label: 'Slack' },
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'Text' },
    ]
    const setupSlides = [
      {
        eyebrow: 'Step 1 of 4',
        title: 'About Them',
        description: 'Tell Beckett who you are talking to and what kind of conversation this should feel like.',
      },
      {
        eyebrow: 'Step 2 of 4',
        title: 'The Conversation',
        description: 'Describe the conversation, your goal, and how much pressure this carries.',
      },
      {
        eyebrow: 'Step 3 of 4',
        title: 'Coaching Target',
        description: 'Choose what you want Beckett to watch for while you practice.',
      },
      {
        eyebrow: 'Step 4 of 4',
        title: 'Before You Start',
        description: 'Use these quick notes to choose your opening move and anticipate the shape of the conversation.',
      },
    ]
    const currentSlide = setupSlides[setupStep]
    const showOtherPersonStyle = showCustomPersonStyle || isCustomCommunicationStyle(personStyle)
    const previewSentences = buildPracticePreview({
      person,
      relationshipContext,
      personStyle,
      situation,
      stakes,
      practiceFocus,
      conversationFormat,
      textSubFormat,
    })
    const prepTipsKey = buildPrepTipsCacheKey({
      mode,
      person,
      relationshipContext,
      personStyle,
      situation,
      goal,
      stakes,
      practiceFocus,
      conversationFormat,
      textSubFormat,
    })
    const fallbackPrepTips = buildPrepTips({
      person,
      personStyle,
      stakes,
      practiceFocus,
      conversationFormat,
      textSubFormat,
    })
    const showPrepTipsLoading = prepTipsLoading && prepTipsCacheKey !== prepTipsKey
    const prepTips = showPrepTipsLoading
      ? buildLoadingPrepTips(fallbackPrepTips)
      : prepTipsCacheKey === prepTipsKey && aiPrepTips
        ? aiPrepTips
        : fallbackPrepTips

    return (
      <div className="w-full max-w-2xl">
        {showContactOverlay && (
          <ContactOverlay
            trustedPeople={trustedPeople}
            onClose={() => setShowContactOverlay(false)}
            onSelect={(c) => { setContactContext(c); if (!person) setPerson(c.name); setShowContactOverlay(false) }}
          />
        )}

        <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Practice a conversation
        </h1>
        <p className="text-ink-mid text-sm mb-6">Rehearse before the real thing. Beckett plays the other person and helps you adjust as you go.</p>

        {activeSessionCandidate && (
          <div className="mb-5 rounded-card border border-primary/20 bg-primary-light/40 p-4">
            <p className="text-sm font-medium text-ink">Continue your unfinished practice?</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-mid">
              Beckett saved your conversation with {activeSessionCandidate.session_data.person || 'the other person'}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => resumeActiveSession(activeSessionCandidate)} className="rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark">Resume</button>
              <button type="button" onClick={abandonActiveSession} className="rounded-pill border border-border bg-white px-4 py-2 text-xs font-medium text-ink-mid hover:border-primary">Start over</button>
            </div>
          </div>
        )}

        {error && !limitNotice && <p className="text-red-600 text-sm mb-4" role="alert">{error}</p>}

        <div className="rounded-card border border-border bg-white p-5 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-light">{currentSlide.eyebrow}</p>
              <h2 className="mt-1 text-xl font-medium text-ink">{currentSlide.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-mid">{currentSlide.description}</p>
            </div>
            <div className="flex gap-1 pt-1" aria-hidden="true">
              {setupSlides.map((slide, index) => (
                <span
                  key={slide.title}
                  className={`h-1.5 w-8 rounded-full ${index === setupStep ? 'bg-primary' : 'bg-border'}`}
                />
              ))}
            </div>
          </div>

          {setupStep === 0 && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">Mode</p>
                  <div className="flex overflow-hidden rounded-pill border border-border" role="group" aria-label="Practice mode">
                    {(['professional', 'personal'] as Mode[]).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        aria-pressed={mode === m}
                        className={`flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                          mode === m ? 'bg-primary text-white' : 'text-ink-mid hover:text-ink'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">Channel</p>
                  <div className="flex flex-wrap overflow-hidden rounded-pill border border-border bg-white" role="group" aria-label="Channel">
                    {textSubFormatOptions.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTextSubFormat(value)}
                        aria-pressed={textSubFormat === value}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                          textSubFormat === value ? 'bg-primary text-white' : 'text-ink-mid hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Who are you talking to?</label>
                <input
                  type="text"
                  value={person}
                  onChange={e => setPerson(e.target.value)}
                  placeholder="e.g. Avery"
                  className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {contactContext && (
                  <div className="mt-2 flex items-center justify-between bg-primary-light rounded-sm px-3 py-2">
                    <p className="text-xs text-primary">Context loaded from {contactContext.name}</p>
                    <button type="button" onClick={() => setContactContext(null)} className="text-xs text-primary hover:underline ml-2" aria-label={`Remove ${contactContext.name} context`}>
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <PracticeTextInput
                label="How do you know them?"
                value={relationshipContext}
                onChange={setRelationshipContext}
                placeholder={
                  mode === 'personal'
                    ? 'e.g. We have been close friends for years, but conflict usually gets awkward between us'
                    : 'e.g. We work on the same launch project, but this is our first time owning a handoff together'
                }
                helperText={
                  mode === 'personal'
                    ? 'A sentence or two is enough. Include the relationship, history, or emotional dynamic that matters here.'
                    : 'A sentence or two is enough. Include the role or work dynamic that matters here.'
                }
              />

              <div>
                <p className="mb-2 text-sm font-medium text-ink">Their communication style</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {communicationStyleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setPersonStyle(suggestion)
                        setShowCustomPersonStyle(false)
                      }}
                      aria-pressed={personStyle === suggestion}
                      className={`rounded-pill border px-3 py-1 text-xs transition-colors ${
                        personStyle === suggestion
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-border bg-white text-ink-mid hover:border-primary hover:text-ink'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomPersonStyle(true)
                      if (communicationStyleSuggestions.includes(personStyle)) setPersonStyle('')
                    }}
                    aria-pressed={showOtherPersonStyle}
                    className={`rounded-pill border px-3 py-1 text-xs transition-colors ${
                      showOtherPersonStyle
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border bg-white text-ink-mid hover:border-primary hover:text-ink'
                    }`}
                  >
                    Other
                  </button>
                </div>
                {showOtherPersonStyle && (
                  <div className="mt-3">
                    <label className="mb-1 block text-sm font-medium text-ink">Other communication style</label>
                    <input
                      type="text"
                      value={personStyle}
                      onChange={e => setPersonStyle(e.target.value)}
                      placeholder="e.g. Blunt when stressed, appreciates context first"
                      className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-ink-light">Describe their style in your own words.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {setupStep === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">What conversation do you want to practice and what is the goal?</label>
                <textarea
                  value={situation}
                  onChange={e => setSituation(e.target.value)}
                  placeholder="e.g. I need to ask what they need from me before Friday without sounding like I missed something obvious"
                  rows={4}
                  className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="mt-1 text-xs text-ink-light">Name the real conversation and what you want to be true by the end.</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-ink">How high-pressure does this feel?</p>
                <div className="flex flex-wrap gap-2">
                  {stakesOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStakes(option)}
                      aria-pressed={stakes === option}
                      className={`rounded-pill border px-3 py-1 text-xs transition-colors ${
                        stakes === option
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div className="space-y-5">
              <div>
                <PracticeTextInput
                  label="What do you want Beckett to help you practice?"
                  value={practiceFocus}
                  onChange={setPracticeFocus}
                  placeholder="e.g. Help me ask directly, stay concise, and not over-apologize"
                  helperText="This helps Beckett tune feedback to the part you most want to improve."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {practiceFocusSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setPracticeFocus(suggestion)}
                      aria-pressed={practiceFocus === suggestion}
                      className={`rounded-pill border px-3 py-1 text-xs transition-colors ${
                        practiceFocus === suggestion
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-card border border-border bg-bg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-light mb-3">Practice preview</p>
                <div className="space-y-2">
                  {previewSentences.map((sentence) => (
                    <p key={sentence} className="text-sm leading-relaxed text-ink">
                      {sentence}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div className="space-y-4" aria-busy={showPrepTipsLoading}>
              {prepTips.map((tip) => (
                <div
                  key={tip.title}
                  className={`rounded-card border border-border bg-bg p-4 ${showPrepTipsLoading ? 'animate-pulse' : ''}`}
                >
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">{tip.title}</p>
                  <p className={`text-sm leading-relaxed ${showPrepTipsLoading ? 'text-ink-light' : 'text-ink'}`}>{tip.text}</p>
                </div>
              ))}
              <div className="rounded-card border border-primary/20 bg-primary-light/40 p-4">
                <p className="text-sm font-medium text-ink">When practice starts, you go first.</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                  Beckett can suggest opening lines once the conversation opens, or you can write
                  the first message yourself.
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => { setError(''); setSetupStep(Math.max(0, setupStep - 1)) }}
              disabled={setupStep === 0}
              className="rounded-pill border border-border px-5 py-2.5 text-sm font-medium text-ink-mid transition-colors hover:border-primary hover:text-ink disabled:opacity-40"
            >
              Back
            </button>

            {setupStep < setupSlides.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (setupStep === 0 && !person.trim()) {
                    setError('Please add the person you want to practice with.')
                    return
                  }
                  if (setupStep === 1 && !situation.trim()) {
                    setError('Please describe the conversation and what you want to accomplish.')
                    return
                  }
                  if (setupStep === 1 && !stakes.trim()) {
                    setError('Please choose how high-pressure this conversation feels.')
                    return
                  }
                  if (setupStep === 2 && !practiceFocus.trim()) {
                    setError('Please choose what you want Beckett to help you practice.')
                    return
                  }
                  setError('')
                  setSetupStep(Math.min(setupSlides.length - 1, setupStep + 1))
                }}
                className="rounded-pill bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={startPractice}
                disabled={loading}
                className="rounded-pill bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {loading ? 'Starting…' : 'Start practice'}
              </button>
            )}
          </div>
        </div>

        {/* Previous sessions */}
        {savedSessions.length > 0 && (
          <div className="mt-10">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Previous sessions</p>
            <div className="space-y-2">
              {savedSessions.map(session => (
                <div key={session.id} className="border border-border rounded-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{session.person}</p>
                    <p className="text-xs text-ink-light truncate">{session.situation}</p>
                    <p className="text-xs text-ink-light/60 mt-0.5">{new Date(session.savedAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => loadSession(session)}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    Resume →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Conversation ───────────────────────────────────────────────────────────

  if (phase === 'conversation') {
    const formatLabel =
      conversationFormat === 'in-person' ? 'In person' :
      textSubFormat === 'sms' ? 'Text' :
      textSubFormat === 'email' ? 'Email' :
      'Slack'
    const isEmailPractice = textSubFormat === 'email' && conversationFormat === 'text'
    const emailThreadSubject = emailSubject.trim() || 'No subject'

    const renderMessages = () => {
      if (isEmailPractice) {
        return (
          <div className="mb-3 flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
            <div className="border-b border-border bg-gray-50 px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Gmail practice</p>
              <p className="mt-1 truncate text-sm font-medium text-ink">{emailThreadSubject}</p>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {messages.length === 0 && !loading && (
                <p className="px-5 py-8 text-center text-xs text-ink-light">You go first — draft your opening email below.</p>
              )}
              {messages.map((m, i) => (
                <div key={i}>
                  <div className="border-b border-border bg-white px-5 py-4 last:border-0">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{m.role === 'user' ? 'You' : person}</p>
                        <p className="truncate text-xs text-ink-light">
                          {m.role === 'user' ? `to ${person || 'recipient'}` : 'to you'}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-ink-light">Practice email</p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.content}</p>
                  </div>
                  {m.role === 'user' && inlineFeedback[i] && (
                    <div className="border-b border-border bg-amber-50 px-5 py-1.5">
                      <p className="text-xs italic text-ink-light">{inlineFeedback[i]}</p>
                    </div>
                  )}
                  {m.role === 'assistant' && assistantFeedback[i] && (
                    <div className="border-b border-border bg-primary-light/40 px-5 py-1.5">
                      <p className="text-xs italic text-ink-light">{assistantFeedback[i]}</p>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="bg-white px-5 py-4" role="status" aria-live="polite">
                  <p className="mb-2 text-xs font-semibold text-ink">{person}</p>
                  <div className="flex h-4 items-center gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-light" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-light" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-light" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="sr-only">{person} is responding</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )
      }

      if (textSubFormat === 'slack' && conversationFormat === 'text') {
        return (
          <div className="flex-1 overflow-y-auto mb-3 border border-border rounded-lg overflow-hidden">
            <div className="bg-white">
              {messages.length === 0 && !loading && (
                <p className="text-xs text-ink-light text-center py-8">You go first — type your opening message below.</p>
              )}
              {messages.map((m, i) => (
                <div key={i}>
                  <div className="flex gap-3 px-4 py-2 hover:bg-gray-50">
                    <div className={`w-8 h-8 rounded flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5 ${m.role === 'user' ? 'bg-primary' : 'bg-gray-500'}`}>
                      {m.role === 'user' ? 'Y' : (person[0]?.toUpperCase() || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-ink">{m.role === 'user' ? 'You' : person}</span>
                      <p className="text-sm text-ink leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                  {m.role === 'user' && inlineFeedback[i] && (
                    <div className="px-4 pb-1 pl-15">
                      <p className="text-xs text-ink-light italic pl-11">{inlineFeedback[i]}</p>
                    </div>
                  )}
                  {m.role === 'assistant' && assistantFeedback[i] && (
                    <div className="px-4 pb-1 pl-16">
                      <p className="text-xs text-ink-light italic">{assistantFeedback[i]}</p>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 px-4 py-2" role="status" aria-live="polite">
                  <div className="w-8 h-8 rounded bg-gray-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex gap-1 items-center h-8" aria-hidden="true">
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="sr-only">{person} is responding</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )
      }

      // Default: SMS / in-person bubble chat
      return (
        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
          {messages.length === 0 && !loading && (
            <p className="text-xs text-ink-light text-center py-8">You go first — type your opening message below.</p>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white border border-border text-ink rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
              {m.role === 'user' && inlineFeedback[i] && (
                <div className="flex justify-end mt-1">
                  <p className="text-xs text-ink-light/70 italic max-w-sm text-right pr-1">
                    {inlineFeedback[i]}
                  </p>
                </div>
              )}
              {m.role === 'assistant' && assistantFeedback[i] && (
                <div className="flex justify-start mt-1">
                  <p className="max-w-sm pl-1 text-xs italic text-ink-light/70">
                    {assistantFeedback[i]}
                  </p>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start" role="status" aria-live="polite">
              <div className="bg-white border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                <div className="flex gap-1 items-center h-4" aria-hidden="true">
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="sr-only">{person} is responding</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )
    }

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col" style={{ height: 'calc(100vh - 96px)' }}>
        {/* Contact header */}
        <div className="flex items-center gap-3 pb-3 mb-3 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-base shrink-0">
            {person[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-ink truncate">{person}</h2>
            <p className="text-xs text-ink-light">
              <span className="capitalize">{mode}</span>
              {' · '}
              {formatLabel}
            </p>
          </div>
          <button
            onClick={endAndDebrief}
            disabled={loading || messages.length < 2}
            aria-label="End conversation and generate feedback"
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40 shrink-0"
          >
            X End Conversation
          </button>
        </div>

        {error && !limitNotice && <p className="text-red-600 text-sm mb-3 shrink-0" role="alert">{error}</p>}
        {limitNotice && (
          <div className="mb-3 shrink-0 rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-ink">
              <span className="font-medium">Beckett:</span> {limitNotice}
            </p>
          </div>
        )}

        {renderMessages()}

        {intervention && (
          <div className={`shrink-0 rounded-card px-4 py-3 flex items-start gap-3 mb-2 ${
            intervention.severity === 'end'
              ? 'bg-red-50 border border-red-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <p className="text-xs text-ink flex-1">
              <span className="font-medium">Beckett:</span> {intervention.message}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {intervention.severity === 'end' && (
                <button
                  onClick={endAndDebrief}
                  className="text-xs bg-red-100 text-red-700 rounded-pill px-2 py-1 hover:bg-red-200 transition-colors"
                >
                  End session
                </button>
              )}
              <button onClick={() => setIntervention(null)} className="text-ink-light hover:text-ink text-xs" aria-label="Dismiss Beckett note">×</button>
            </div>
          </div>
        )}

        {suggestedPrompts.length > 0 && (
          <div className="mb-2 shrink-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">Need a starting point?</p>
            <div className={isEmailPractice ? 'grid gap-2' : 'flex gap-2 flex-wrap'}>
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt); setSentViaPrompt(true); setDraftNote(null); setDraftImprovedResponse(null) }}
                  className={isEmailPractice
                    ? 'whitespace-pre-wrap rounded-card border border-border bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-ink-mid transition-colors hover:border-primary hover:text-ink'
                    : 'rounded-pill border border-border px-3 py-1 text-xs text-ink-mid transition-colors hover:border-primary hover:text-ink'
                  }
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {isEmailPractice ? (
          <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <div className="bg-gray-100 px-4 py-2 text-xs font-medium text-ink">New Message</div>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
              <span className="text-ink-light">To</span>
              <span className="min-w-0 flex-1 truncate text-ink">{person || 'recipient'}</span>
            </div>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
              <label htmlFor="practice-email-subject" className="text-ink-light">Subject</label>
              <input
                id="practice-email-subject"
                type="text"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Subject"
                disabled={loading}
                className="min-w-0 flex-1 border-0 bg-transparent text-ink placeholder:text-ink-light focus:outline-none focus:ring-0"
              />
            </div>
            <textarea
              ref={textareaRef}
              aria-label="Email body"
              rows={6}
              value={input}
              onChange={e => { setInput(e.target.value); setDraftNote(null); setDraftImprovedResponse(null); setSentViaPrompt(false) }}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Write your email..."
              disabled={loading}
              style={{ resize: 'none', overflowY: 'auto', minHeight: '148px', maxHeight: '220px' }}
              className="w-full border-0 bg-white px-4 py-3 text-sm leading-relaxed text-ink focus:outline-none focus:ring-0"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="rounded-pill bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                Send
              </button>
              <button
                onClick={getDraftFeedback}
                disabled={draftLoading || loading || !input.trim() || sentViaPrompt}
                className="rounded-pill border border-border px-4 py-2.5 text-sm text-ink-mid transition-colors hover:border-primary hover:text-ink disabled:opacity-40"
                title={sentViaPrompt ? 'Edit the suggestion before asking Beckett for feedback.' : undefined}
              >
                {draftLoading ? '…' : 'Get feedback'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 shrink-0 items-end">
            <textarea
              ref={textareaRef}
              aria-label="Your practice message"
              rows={1}
              value={input}
              onChange={e => { setInput(e.target.value); setDraftNote(null); setDraftImprovedResponse(null); setSentViaPrompt(false) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder={
                textSubFormat === 'slack' ? 'Message…' :
                'Your turn…'
              }
              disabled={loading}
              style={{ resize: 'none', overflowY: 'hidden', minHeight: '42px', maxHeight: '160px' }}
              className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={getDraftFeedback}
              disabled={draftLoading || loading || !input.trim() || sentViaPrompt}
              className="border border-border text-ink-mid rounded-pill px-4 py-2.5 text-sm hover:text-ink hover:border-primary transition-colors disabled:opacity-40 shrink-0"
              title={sentViaPrompt ? 'Edit the suggestion before asking Beckett for feedback.' : undefined}
            >
              {draftLoading ? '…' : 'Get feedback'}
            </button>
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-primary text-white rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
            >
              Send
            </button>
          </div>
        )}

        {(draftNote || draftImprovedResponse) && (
          <div className="mt-2 shrink-0 rounded-card border border-primary/15 bg-primary-light/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Beckett feedback</p>
              <button
                onClick={() => { setDraftNote(null); setDraftImprovedResponse(null) }}
                className="text-ink-light hover:text-ink text-xs shrink-0"
                aria-label="Dismiss draft feedback"
              >
                ×
              </button>
            </div>
            {draftNote && (
              <p className="text-xs leading-relaxed text-ink-mid italic">{draftNote}</p>
            )}
            {draftImprovedResponse && (
              <div className="mt-3 rounded-sm border border-border bg-white p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-light">Improved response</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{draftImprovedResponse}</p>
                <button
                  type="button"
                  onClick={() => {
                    setInput(draftImprovedResponse)
                    setSentViaPrompt(false)
                    setDraftNote(null)
                    setDraftImprovedResponse(null)
                  }}
                  className="mt-3 rounded-pill border border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
                >
                  Use this response
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    )
  }

  // ── Practice feedback ──────────────────────────────────────────────────────

  if (phase === 'feedback') {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          How was this practice?
        </h1>
        <p className="text-ink-mid text-sm mb-8">Optional beta feedback helps Beckett make practice more useful.</p>

        <div className="bg-white border border-border rounded-card p-5 mb-6">
          {practiceFeedbackSubmitted ? (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Thanks — this helps us make Beckett better.</p>
              <p className="text-sm text-ink-mid leading-relaxed">We&apos;ll use this to tune practice before more beta users try it.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Did this practice session feel useful?</p>
              <p className="mb-4 text-xs leading-relaxed text-ink-light">
                Practice feedback is saved for beta review and may include the notes you type here.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { value: 'yes', label: 'Useful' },
                  { value: 'no', label: 'Needs work' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPracticeFeedbackRating(option.value as PracticeFeedbackRating)}
                    className={`rounded-sm border px-4 py-2.5 text-sm font-medium transition-colors ${
                      practiceFeedbackRating === option.value
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <PracticeFeedbackTextarea
                  label="What felt most useful?"
                  value={practiceFeedbackUseful}
                  onChange={setPracticeFeedbackUseful}
                  placeholder="A tip, prompt, roleplay moment, or piece of feedback."
                />
                <PracticeFeedbackTextarea
                  label="Where did Beckett feel too much, too vague, or off?"
                  value={practiceFeedbackOff}
                  onChange={setPracticeFeedbackOff}
                  placeholder="Anything that felt confusing, intense, generic, or wrong."
                />
                <PracticeFeedbackTextarea
                  label="Would you use this before the real situation?"
                  value={practiceFeedbackWouldUse}
                  onChange={setPracticeFeedbackWouldUse}
                  placeholder="Yes, no, maybe — and why."
                />
              </div>

              {practiceFeedbackError && <p className="text-xs text-red-600 mt-3">{practiceFeedbackError}</p>}

              <button
                type="button"
                onClick={submitPracticeFeedback}
                disabled={!practiceFeedbackRating || practiceFeedbackSubmitting}
                className="mt-4 w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
              >
                {practiceFeedbackSubmitting ? 'Saving…' : 'Send practice feedback'}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetToSetup}
            className="flex-1 border border-primary text-primary rounded-pill py-3 text-sm font-medium hover:bg-primary-light transition-colors"
          >
            Practice again
          </button>
          <a
            href="/dashboard"
            className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium text-center hover:bg-primary-dark transition-colors"
          >
            {practiceFeedbackSubmitted ? 'Back to overview' : 'Skip feedback'}
          </a>
        </div>
      </div>
    )
  }

  // ── Debrief ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        How did it go?
      </h1>
      <p className="text-ink-mid text-sm mb-8">Honest feedback from Beckett.</p>

      {loading && <p className="text-ink-mid text-sm">Generating feedback…</p>}

      {!loading && debrief && (
        <div className="space-y-4">
          {[
            { label: 'How they likely felt', value: debrief.other_person_felt },
            { label: 'How you came across', value: debrief.how_you_came_across },
            { label: 'What went well', value: debrief.what_went_well },
            { label: 'Things to work on', value: debrief.things_to_work_on },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-border rounded-card p-5">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">{label}</p>
              <p className="text-sm text-ink leading-relaxed">{value}</p>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              onClick={resetToSetup}
              className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setPhase('feedback')}
              className="flex-1 border border-border rounded-pill py-3 text-sm font-medium text-ink text-center hover:bg-primary-light transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PracticeTextInput({
  label,
  value,
  onChange,
  placeholder,
  helperText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  helperText?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {helperText && <p className="mt-1 text-xs text-ink-light">{helperText}</p>}
    </div>
  )
}

function PracticeFeedbackTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-light mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  )
}
