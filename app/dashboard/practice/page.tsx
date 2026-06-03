'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Phase = 'setup' | 'conversation' | 'debrief'
type Message = { role: 'user' | 'assistant'; content: string }
type TrustedPerson = { id: string; name: string; relationship: string; communication_style: string; notes: string }
type DebriefData = { other_person_felt: string; how_you_came_across: string; what_went_well: string; things_to_work_on: string }

const SUGGESTED_PROMPTS = [
  "I need to bring something up with you.",
  "I want to be honest with you about something.",
  "That makes sense, but I see it differently.",
  "Can we talk about this more directly?",
]

function buildSystemPrompt(person: string, situation: string, goal: string, trustedPerson?: TrustedPerson | null) {
  let prompt = `You are playing the role of ${person} in a practice conversation.
The user is preparing to have this real conversation: "${situation}"
Their goal: "${goal}"`

  if (trustedPerson?.communication_style) {
    prompt += `\n\nContext about ${person}: ${trustedPerson.communication_style}`
    if (trustedPerson.notes) prompt += ` Additional notes: ${trustedPerson.notes}`
  }

  prompt += `\n\nStay in character throughout. Respond as this person realistically would — including appropriate resistance, questions, or emotional reactions. Do not be artificially easy or artificially difficult. Be realistic.`
  return prompt
}

export default function PracticePage() {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>('setup')
  const [person, setPerson] = useState('')
  const [situation, setSituation] = useState('')
  const [goal, setGoal] = useState('')
  const [trustedPeople, setTrustedPeople] = useState<TrustedPerson[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [inlineFeedback, setInlineFeedback] = useState<Record<number, string>>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
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
  }, [])

  const selectedTrustedPerson = trustedPeople.find(p => p.id === selectedPersonId) || null

  async function startPractice() {
    if (!person.trim() || !situation.trim()) {
      setError('Please fill in who this is with and what you need to work through.')
      return
    }
    setError('')
    setPhase('conversation')
    setLoading(true)
    const system = buildSystemPrompt(person, situation, goal, selectedTrustedPerson)
    const seed: Message[] = [{ role: 'user', content: '(start the conversation — say the first thing as this person would)' }]
    const text = await callPractice({ action: 'turn', system, messages: seed })
    setLoading(false)
    if (text) setMessages([{ role: 'assistant', content: text }])
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    const userIndex = next.length - 1
    setMessages(next)
    setInput('')
    setLoading(true)
    const system = buildSystemPrompt(person, situation, goal, selectedTrustedPerson)
    const text = await callPractice({ action: 'turn', system, messages: next })
    setLoading(false)
    if (text) {
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
      // Fire inline feedback in background
      const context = `${person} — ${situation}`
      callPracticeRaw({ action: 'inline_feedback', userMessage: userMsg.content, context })
        .then(data => {
          if (data?.note) setInlineFeedback(prev => ({ ...prev, [userIndex]: data.note as string }))
        })
        .catch(() => {})
    }
  }

  async function endAndDebrief() {
    setLoading(true)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : person}]: ${m.content}`).join('\n')
    const result = await callPracticeRaw({
      action: 'debrief',
      personDescription: person,
      situation,
      goal,
      conversationHistory: history,
    })
    setLoading(false)
    if (result && !result.error) {
      setDebrief(result as DebriefData)
      setPhase('debrief')
    } else {
      setError(result?.error as string || 'Something went wrong.')
    }
  }

  async function callPractice(body: Record<string, unknown>): Promise<string> {
    setError('')
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error || 'Something went wrong.'); return '' }
      return data.text || ''
    } catch {
      setError('Network error — please try again.')
      return ''
    }
  }

  async function callPracticeRaw(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await res.json() as Record<string, unknown>
    } catch {
      return {}
    }
  }

  function resetToSetup() {
    setPhase('setup')
    setMessages([])
    setDebrief(null)
    setInlineFeedback({})
    setError('')
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="max-w-lg">
        <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Practice a conversation
        </h1>
        <p className="text-ink-mid text-sm mb-8">Rehearse before the real thing. The AI plays the other person.</p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Who is this with?</label>
            <input
              type="text"
              value={person}
              onChange={e => setPerson(e.target.value)}
              placeholder="e.g. my manager, a close friend, a colleague named Alex"
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">What is this conversation about?</label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="e.g. I need to ask for a raise, I want to set a limit around weekend messages, I need to give feedback about their attitude in meetings"
              rows={3}
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">What do you want out of it?</label>
            <input
              type="text"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g. I want them to understand why this matters to me"
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {trustedPeople.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Is this someone from your Trusted People?{' '}
                <span className="font-normal text-ink-light">(optional)</span>
              </label>
              <select
                value={selectedPersonId}
                onChange={e => {
                  setSelectedPersonId(e.target.value)
                  const tp = trustedPeople.find(p => p.id === e.target.value)
                  if (tp && !person) setPerson(tp.name)
                }}
                className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">None</option>
                {trustedPeople.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.relationship ? ` — ${p.relationship}` : ''}
                  </option>
                ))}
              </select>
              {selectedTrustedPerson?.communication_style && (
                <p className="text-xs text-ink-light mt-1.5 leading-relaxed">
                  Using their communication style to shape the AI.
                </p>
              )}
            </div>
          )}

          <button
            onClick={startPractice}
            disabled={loading}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Starting…' : 'Start practice'}
          </button>
        </div>
      </div>
    )
  }

  // ── Conversation ───────────────────────────────────────────────────────────

  if (phase === 'conversation') {
    return (
      <div className="max-w-lg flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-base font-medium text-ink">{person}</h2>
            <p className="text-xs text-ink-light">{goal || situation.slice(0, 60)}{!goal && situation.length > 60 ? '…' : ''}</p>
          </div>
          <button
            onClick={endAndDebrief}
            disabled={loading || messages.length < 2}
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40"
          >
            End + get feedback
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white border border-border text-ink rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
              {m.role === 'user' && inlineFeedback[i] && (
                <div className="flex justify-end mt-1">
                  <p className="text-xs text-ink-light/70 italic max-w-xs text-right pr-1">
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

        {/* Suggested prompts */}
        <div className="flex gap-2 flex-wrap mb-2 shrink-0">
          {SUGGESTED_PROMPTS.map(prompt => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              className="text-xs border border-border rounded-pill px-3 py-1 text-ink-mid hover:text-ink hover:border-primary transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
            placeholder="Your turn…"
            disabled={loading}
            className="flex-1 border border-border rounded-pill px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-primary text-white rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    )
  }

  // ── Debrief ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        How did it go?
      </h1>
      <p className="text-ink-mid text-sm mb-8">Honest feedback from Beckett.</p>

      {loading && <p className="text-ink-mid text-sm">Generating feedback…</p>}

      {!loading && debrief && (
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">How they likely felt</p>
            <p className="text-sm text-ink leading-relaxed">{debrief.other_person_felt}</p>
          </div>
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">How you came across</p>
            <p className="text-sm text-ink leading-relaxed">{debrief.how_you_came_across}</p>
          </div>
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">What went well</p>
            <p className="text-sm text-ink leading-relaxed">{debrief.what_went_well}</p>
          </div>
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Things to work on</p>
            <p className="text-sm text-ink leading-relaxed">{debrief.things_to_work_on}</p>
          </div>

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
