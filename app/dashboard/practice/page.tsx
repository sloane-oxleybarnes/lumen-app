'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type Goal = 'Resolve a conflict' | 'Deliver hard feedback' | 'Ask for something' | 'Set a boundary' | 'Just practice'
type Phase = 'setup' | 'conversation' | 'debrief'
type Message = { role: 'user' | 'assistant'; content: string }

const GOALS: Goal[] = ['Resolve a conflict', 'Deliver hard feedback', 'Ask for something', 'Set a boundary', 'Just practice']

function buildSystemPrompt(person: string, situation: string, goal: string) {
  return `You are playing the role of ${person} in a practice conversation.
The user is preparing to have this real conversation: "${situation}"
Their goal: "${goal}"

Stay in character throughout. Respond as this person realistically would — including appropriate resistance, questions, or emotional reactions. Do not be artificially easy or artificially difficult. Be realistic.
After 6-8 exchanges, you may naturally offer to break character and give feedback, but only if the conversation has reached a natural pause.`
}

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [person, setPerson] = useState('')
  const [situation, setSituation] = useState('')
  const [goal, setGoal] = useState<Goal>('Just practice')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debrief, setDebrief] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function startPractice() {
    if (!person.trim() || !situation.trim()) {
      setError('Please fill in who this is with and what you need to work through.')
      return
    }
    setError('')
    setPhase('conversation')
    // Kick off with AI opening line
    setLoading(true)
    const system = buildSystemPrompt(person, situation, goal)
    const seed: Message[] = [{ role: 'user', content: '(start the conversation — say the first thing as this person, greet me or react to seeing me)' }]
    const text = await callPractice({ action: 'turn', system, messages: seed })
    setLoading(false)
    if (text) setMessages([{ role: 'assistant', content: text }])
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    const system = buildSystemPrompt(person, situation, goal)
    const text = await callPractice({ action: 'turn', system, messages: next })
    setLoading(false)
    if (text) setMessages(prev => [...prev, { role: 'assistant', content: text }])
  }

  async function endAndDebrief() {
    setLoading(true)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : person}]: ${m.content}`).join('\n')
    const result = await callPractice({
      action: 'debrief',
      personDescription: person,
      situation,
      goal,
      conversationHistory: history,
    })
    setLoading(false)
    if (result) {
      setDebrief(result)
      setPhase('debrief')
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
      const data = await res.json() as { text?: string; result?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error || 'Something went wrong.'); return '' }
      return data.text || data.result || ''
    } catch {
      setError('Network error — please try again.')
      return ''
    }
  }

  function resetToSetup() {
    setPhase('setup')
    setMessages([])
    setDebrief('')
    setError('')
  }

  if (phase === 'setup') {
    return (
      <div className="max-w-lg mx-auto px-6 py-12">
        <Link href="/dashboard" className="text-sm text-ink-mid hover:text-ink mb-8 inline-block">← Dashboard</Link>

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
            <label className="block text-sm font-medium text-ink mb-1">What do you need to say or work through?</label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="e.g. I need to ask for a raise, I want to set a limit around weekend messages, I need to give feedback about their attitude in meetings"
              rows={3}
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">What is your goal?</label>
            <div className="space-y-2">
              {GOALS.map(g => (
                <label key={g} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="goal"
                    value={g}
                    checked={goal === g}
                    onChange={() => setGoal(g)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-ink">{g}</span>
                </label>
              ))}
            </div>
          </div>

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

  if (phase === 'conversation') {
    return (
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg text-ink font-medium">{person}</h2>
            <p className="text-xs text-ink-light">{situation.slice(0, 60)}{situation.length > 60 ? '…' : ''}</p>
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

        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-white border border-border text-ink rounded-bl-sm'
              }`}>
                {m.content}
              </div>
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

        <div className="flex gap-2">
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

  // Debrief phase
  const sections = debrief.split(/\n(?=\d+\.)/).map(s => s.replace(/^\d+\.\s*/, '').trim())
  const [wentWell = '', rephrase = '', alternative = ''] = sections

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        How did it go?
      </h1>
      <p className="text-ink-mid text-sm mb-8">Honest feedback from Beckett.</p>

      {loading && <p className="text-ink-mid text-sm">Generating feedback…</p>}

      {!loading && debrief && (
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">What landed well</p>
            <p className="text-sm text-ink leading-relaxed">{wentWell || debrief}</p>
          </div>
          {rephrase && (
            <div className="bg-white border border-border rounded-card p-5">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">One thing to rephrase</p>
              <p className="text-sm text-ink leading-relaxed">{rephrase}</p>
            </div>
          )}
          {alternative && (
            <div className="bg-white border border-border rounded-card p-5">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Alternative approach</p>
              <p className="text-sm text-ink leading-relaxed">{alternative}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={resetToSetup}
              className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Try again
            </button>
            <Link
              href="/dashboard"
              className="flex-1 border border-border rounded-pill py-3 text-sm font-medium text-ink text-center hover:bg-primary-light transition-colors"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
