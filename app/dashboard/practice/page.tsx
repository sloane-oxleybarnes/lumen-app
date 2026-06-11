'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Phase = 'setup' | 'conversation' | 'debrief'
type Mode = 'personal' | 'professional'
type ConversationFormat = 'text' | 'in-person' | 'not-sure'
type TextSubFormat = 'slack' | 'email' | 'sms' | 'not-sure'
type Message = { role: 'user' | 'assistant'; content: string }
type TrustedPerson = { id: string; name: string; relationship: string; communication_style: string; notes: string }
type ContactContext = { name: string; style: string; notes: string }
type DebriefData = { other_person_felt: string; how_you_came_across: string; what_went_well: string; things_to_work_on: string }
type Intervention = { severity: 'warning' | 'end'; message: string }
type SavedSession = {
  id: string
  person: string
  situation: string
  goal: string
  mode: Mode
  conversationFormat: ConversationFormat
  textSubFormat: TextSubFormat
  relationshipContext?: string
  personStyle?: string
  recurringPattern?: string
  stakes?: string
  expectedResponse?: string
  practiceFocus?: string
  messages: Message[]
  savedAt: string
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
  'Avoids conflict',
  'Gets defensive when surprised',
]

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
    practiceContext.relationshipContext ? `Relationship/context: ${practiceContext.relationshipContext}` : null,
    practiceContext.personStyle ? `Their communication style: ${practiceContext.personStyle}` : null,
    practiceContext.recurringPattern ? `What tends to happen with them: ${practiceContext.recurringPattern}` : null,
    practiceContext.stakes ? `Stakes/pressure level: ${practiceContext.stakes}` : null,
    practiceContext.expectedResponse ? `Likely response from them: ${practiceContext.expectedResponse}` : null,
    practiceContext.practiceFocus ? `What Beckett should help the user practice: ${practiceContext.practiceFocus}` : null,
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

  prompt += `\n\nStay in character throughout. Respond as this person realistically would — including appropriate resistance, questions, or emotional reactions. Do not be artificially easy or artificially difficult. Be realistic.`
  return prompt
}

// ── LocalStorage helpers ───────────────────────────────────────────────────

function loadSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem('beckett_practice_sessions')
    if (!raw) return []
    return JSON.parse(raw) as SavedSession[]
  } catch { return [] }
}

function persistSession(session: SavedSession) {
  try {
    const existing = loadSavedSessions()
    const updated = [session, ...existing.filter(s => s.id !== session.id)].slice(0, 5)
    localStorage.setItem('beckett_practice_sessions', JSON.stringify(updated))
    return updated
  } catch { return [] }
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
          <h2 className="text-base font-medium text-ink">Connect a contact</h2>
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
  const [mode, setMode] = useState<Mode>('professional')
  const [conversationFormat, setConversationFormat] = useState<ConversationFormat>('text')
  const [textSubFormat, setTextSubFormat] = useState<TextSubFormat>('slack')
  const [person, setPerson] = useState('')
  const [situation, setSituation] = useState('')
  const [goal, setGoal] = useState('')
  const [relationshipContext, setRelationshipContext] = useState('')
  const [personStyle, setPersonStyle] = useState('')
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
  const [error, setError] = useState('')
  const [limitNotice, setLimitNotice] = useState<string | null>(null)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [inlineFeedback, setInlineFeedback] = useState<Record<number, string>>({})
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])
  const [intervention, setIntervention] = useState<Intervention | null>(null)
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  useEffect(() => {
    setSavedSessions(loadSavedSessions())
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
    loadTrustedPeople()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSuggestedPrompts = useCallback(async (lastAIMessage?: string, msgCount = 0) => {
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggested_prompts', mode, person, situation, goal, messageCount: msgCount, lastAIMessage }),
      })
      const data = await res.json() as { prompts?: string[]; error?: string }
      if (!res.ok) {
        if (data.error) setLimitNotice(data.error)
        return
      }
      if (data.prompts?.length) setSuggestedPrompts(data.prompts)
    } catch { /* non-blocking */ }
  }, [mode, person, situation, goal])

  async function getDraftFeedback() {
    if (!input.trim() || draftLoading) return
    setDraftLoading(true)
    setLimitNotice(null)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : person}]: ${m.content}`).join('\n')
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft_feedback', mode, userMessage: input, conversationHistory: history, person, situation, goal }),
    })
    const data = await res.json() as { note?: string; error?: string }
    setDraftLoading(false)
    if (!res.ok) {
      setLimitNotice(data.error || 'Beckett could not generate feedback right now.')
      return
    }
    if (data.note) setDraftNote(data.note)
  }

  async function startPractice() {
    if (!person.trim() || !situation.trim()) {
      setError('Please add the person and the conversation you want help with.')
      return
    }
    setError('')
    setMessages([])
    setPhase('conversation')
    setLimitNotice(null)
    loadSuggestedPrompts(undefined, 0)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const wasSentViaPrompt = sentViaPrompt
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    const userIndex = next.length - 1
    setMessages(next)
    setInput('')
    setDraftNote(null)
    setSuggestedPrompts([])
    setSentViaPrompt(false)
    setLoading(true)
    setLimitNotice(null)
    const system = buildSystemPrompt(
      person,
      situation,
      goal,
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

      if (!wasSentViaPrompt) {
        const context = `${person} — ${situation}`
        fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'inline_feedback', mode, userMessage: userMsg.content, context }),
        })
          .then(r => r.json())
          .then((d: { note?: string }) => { if (d.note) setInlineFeedback(prev => ({ ...prev, [userIndex]: d.note as string })) })
          .catch(() => {})
      }

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
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'debrief', mode, personDescription: person, situation, goal, conversationHistory: history }),
    })
    const result = await res.json() as DebriefData & { error?: string }
    setLoading(false)
    if (result.error) { setError(result.error); return }

    const session: SavedSession = {
      id: Date.now().toString(),
      person,
      situation,
      goal,
      mode,
      conversationFormat,
      textSubFormat,
      relationshipContext,
      personStyle,
      recurringPattern,
      stakes,
      expectedResponse,
      practiceFocus,
      messages,
      savedAt: new Date().toISOString(),
    }
    setSavedSessions(persistSession(session))

    setDebrief(result)
    setPhase('debrief')
  }

  function loadSession(session: SavedSession) {
    setPerson(session.person)
    setSituation(session.situation)
    setGoal(session.goal)
    setMode(session.mode)
    setConversationFormat(session.conversationFormat)
    setTextSubFormat(session.textSubFormat)
    setRelationshipContext(session.relationshipContext || '')
    setPersonStyle(session.personStyle || '')
    setRecurringPattern(session.recurringPattern || '')
    setStakes(session.stakes || '')
    setExpectedResponse(session.expectedResponse || '')
    setPracticeFocus(session.practiceFocus || '')
    setMessages(session.messages)
    setInlineFeedback({})
    setSuggestedPrompts([])
    setDraftNote(null)
    setIntervention(null)
    setError('')
    setPhase('conversation')
  }

  function resetToSetup() {
    setPhase('setup')
    setMessages([])
    setDebrief(null)
    setInlineFeedback({})
    setSuggestedPrompts([])
    setDraftNote(null)
    setIntervention(null)
    setError('')
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    const textSubFormatOptions: { value: TextSubFormat; label: string }[] = [
      { value: 'slack', label: 'Slack' },
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'Text message' },
      { value: 'not-sure', label: 'Not sure' },
    ]

    return (
      <div className="w-full max-w-3xl">
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
        <p className="text-ink-mid text-sm mb-4">Rehearse before the real thing. Beckett plays the other person and helps you adjust as you go.</p>

        <div className="mb-8 rounded-card border border-border bg-white p-4">
          <p className="text-sm font-medium text-ink mb-1">Start with the basics and Beckett will help shape the rest.</p>
          <p className="text-sm text-ink-mid leading-relaxed">
            Add who this is with, what you need to say, and where things usually get sticky. You can keep this brief.
          </p>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {/* Toggles row */}
        <div className="mb-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          {/* Mode */}
          <div>
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Mode</p>
            <div className="flex rounded-pill border border-border overflow-hidden">
              {(['professional', 'personal'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                    mode === m ? 'bg-primary text-white' : 'text-ink-mid hover:text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Channel format</p>
            <div className="flex flex-wrap overflow-hidden rounded-pill border border-border bg-white">
              {textSubFormatOptions.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTextSubFormat(value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    textSubFormat === value ? 'bg-primary text-white' : 'text-ink-mid hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-ink">Person&apos;s name</label>
              <button
                onClick={() => setShowContactOverlay(true)}
                className="text-xs text-primary hover:underline"
              >
                {contactContext ? `Using: ${contactContext.name}` : '+ Connect a contact'}
              </button>
            </div>
            <input
              type="text"
              value={person}
              onChange={e => setPerson(e.target.value)}
              placeholder="e.g. Nick"
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {contactContext && (
              <div className="mt-2 flex items-center justify-between bg-primary-light rounded-sm px-3 py-2">
                <p className="text-xs text-primary">Context loaded from {contactContext.name}</p>
                <button onClick={() => setContactContext(null)} className="text-xs text-primary hover:underline ml-2">Remove</button>
              </div>
            )}
          </div>

          <PracticeTextInput
            label="How do you know them?"
            value={relationshipContext}
            onChange={setRelationshipContext}
            placeholder="e.g. They&apos;ve been my manager for 2 years and we usually have high trust"
            helperText="A sentence or two is enough. Include the role or dynamic that matters here."
          />

          <div>
            <label className="block text-sm font-medium text-ink mb-1">What conversation do you want to practice?</label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="e.g. I need to set a boundary around weekend messages without sounding combative"
              rows={3}
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="mt-1 text-xs text-ink-light">What is the real conversation, and what feels hard about starting it?</p>
          </div>

          <div>
            <PracticeTextInput
              label="Their communication style"
              value={personStyle}
              onChange={setPersonStyle}
              placeholder="e.g. Friendly, but avoids direct criticism and gets tense when surprised"
              helperText="Pick one of these if it helps you get started."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {communicationStyleSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPersonStyle(suggestion)}
                  className={`rounded-pill border px-3 py-1 text-xs transition-colors ${
                    personStyle === suggestion
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <PracticeTextarea
            label="What usually gets hard in this dynamic?"
            value={recurringPattern}
            onChange={setRecurringPattern}
            placeholder="e.g. I over-explain, they stay vague, and we leave without a clear next step"
            helperText="This is the pattern Beckett should watch for while you practice."
          />

          <div>
            <PracticeTextInput
              label="How high-pressure does this feel?"
              value={stakes}
              onChange={setStakes}
              placeholder="e.g. High stakes for my role"
              helperText="Choose a quick option or write your own."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {stakesOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStakes(option)}
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

          <PracticeTextInput
            label="What response do you expect from them?"
            value={expectedResponse}
            onChange={setExpectedResponse}
            placeholder="e.g. They may push back at first, then ask me to prioritize"
            helperText="If you are not sure, add your best guess."
          />

          <PracticeTextInput
            label="What outcome do you want?"
            value={goal}
            onChange={setGoal}
            placeholder="e.g. I want them to respect the boundary and help me reprioritize"
          />

          <div>
            <PracticeTextInput
              label="What do you want Beckett to help you practice?"
              value={practiceFocus}
              onChange={setPracticeFocus}
              placeholder="e.g. Help me start clearly and not backpedal"
              helperText="This helps Beckett tune feedback to the part you most want to improve."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {practiceFocusSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPracticeFocus(suggestion)}
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

          <button
            onClick={startPractice}
            disabled={loading}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 lg:col-span-2"
          >
            {loading ? 'Starting…' : 'Start practice'}
          </button>
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
      textSubFormat === 'sms' ? 'Text message' :
      textSubFormat === 'email' ? 'Email' :
      textSubFormat === 'not-sure' ? 'Not sure' : 'Slack'

    const renderMessages = () => {
      if (textSubFormat === 'email' && conversationFormat === 'text') {
        return (
          <div className="flex-1 overflow-y-auto mb-3 border border-border rounded-lg overflow-hidden bg-gray-50">
            {messages.length === 0 && !loading && (
              <p className="text-xs text-ink-light text-center py-8">You go first — type your opening message below.</p>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`px-5 py-4 border-b border-border last:border-0 ${m.role === 'user' ? 'bg-white' : 'bg-gray-50'}`}>
                  <p className="text-xs font-semibold text-ink mb-2">{m.role === 'user' ? 'You' : person}</p>
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{m.content}</p>
                </div>
                {m.role === 'user' && inlineFeedback[i] && (
                  <div className="px-5 py-1.5 bg-amber-50 border-b border-border">
                    <p className="text-xs text-ink-light italic">{inlineFeedback[i]}</p>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="px-5 py-4 bg-gray-50">
                <p className="text-xs font-semibold text-ink mb-2">{person}</p>
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )
      }

      if (textSubFormat === 'slack' && conversationFormat === 'text') {
        return (
          <div className="flex-1 overflow-y-auto mb-3 border border-border rounded-lg overflow-hidden">
            <div className="bg-gray-800 px-4 py-2 flex items-center gap-2 shrink-0">
              <span className="text-gray-400 text-sm font-medium">#</span>
              <span className="text-white text-sm font-medium truncate">{situation.slice(0, 40)}{situation.length > 40 ? '…' : ''}</span>
            </div>
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
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 px-4 py-2">
                  <div className="w-8 h-8 rounded bg-gray-300 flex-shrink-0 mt-0.5" />
                  <div className="flex gap-1 items-center h-8">
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
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
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
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
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40 shrink-0"
          >
            End + get feedback
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mb-3 shrink-0">{error}</p>}
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
              <button onClick={() => setIntervention(null)} className="text-ink-light hover:text-ink text-xs">×</button>
            </div>
          </div>
        )}

        {suggestedPrompts.length > 0 && (
          <div className="mb-2 shrink-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">Need a starting point?</p>
            <div className="flex gap-2 flex-wrap">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt); setSentViaPrompt(true); setDraftNote(null) }}
                  className="text-xs border border-border rounded-pill px-3 py-1 text-ink-mid hover:text-ink hover:border-primary transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 shrink-0 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => { setInput(e.target.value); setDraftNote(null); setSentViaPrompt(false) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={
              textSubFormat === 'email' ? 'Type your reply…' :
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

        {draftNote && (
          <div className="flex items-start gap-2 mt-2 shrink-0">
            <p className="text-xs text-ink-mid italic flex-1">
              <span className="not-italic text-ink-light">↳ Beckett:</span> {draftNote}
            </p>
            <button onClick={() => setDraftNote(null)} className="text-ink-light hover:text-ink text-xs shrink-0">×</button>
          </div>
        )}

        <div className="mt-4 shrink-0 border-t border-border pt-3">
          <a
            href="mailto:hello@meetbeckett.co?subject=Beckett%20beta%20feedback%20-%20Practice"
            className="text-xs text-primary hover:underline"
          >
            Share beta feedback about practice
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
            <a
              href="/dashboard"
              className="flex-1 border border-border rounded-pill py-3 text-sm font-medium text-ink text-center hover:bg-primary-light transition-colors"
            >
              Back to overview
            </a>
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

function PracticeTextarea({
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
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
      {helperText && <p className="mt-1 text-xs text-ink-light">{helperText}</p>}
    </div>
  )
}
