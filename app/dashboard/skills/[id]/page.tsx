'use client'
import { useState, useRef, useEffect, use } from 'react'
import Link from 'next/link'
import { SKILL_MODULES, type Scenario } from '@/lib/skills'

type Phase = 'frame' | 'conversation' | 'debrief'
type Message = { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(scenario: Scenario, goal: string) {
  return `You are playing the role of ${scenario.persona} in a practice conversation.
The user is practicing: "${scenario.situation}"
Their goal: "${goal}"

Stay in character. Respond realistically — including natural resistance, questions, or reactions. Difficulty level: ${scenario.difficulty}. Be appropriately challenging for that level.`
}

export default function SkillModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const module = SKILL_MODULES.find(m => m.id === id)

  const [phase, setPhase] = useState<Phase>('frame')
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debrief, setDebrief] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!module) {
    return (
      <div className="max-w-lg mx-auto px-6 py-12">
        <Link href="/dashboard/skills" className="text-sm text-ink-mid hover:text-ink mb-8 inline-block">← Skill modules</Link>
        <p className="text-ink-mid">Module not found.</p>
      </div>
    )
  }

  const scenario = module.scenarios[scenarioIndex]

  async function startPractice() {
    setPhase('conversation')
    setMessages([])
    setError('')
    setLoading(true)
    const system = buildSystemPrompt(scenario, module!.description)
    const seed: Message[] = [{ role: 'user', content: '(start — greet me or react naturally as this person would at the beginning of this interaction)' }]
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
    const system = buildSystemPrompt(scenario, module!.description)
    const text = await callPractice({ action: 'turn', system, messages: next })
    setLoading(false)
    if (text) setMessages(prev => [...prev, { role: 'assistant', content: text }])
  }

  async function endAndDebrief() {
    setLoading(true)
    const history = messages.map(m => `[${m.role === 'user' ? 'You' : scenario.persona}]: ${m.content}`).join('\n')
    const result = await callPractice({
      action: 'debrief',
      personDescription: scenario.persona,
      situation: scenario.situation,
      goal: module!.description,
      conversationHistory: history,
    })
    setLoading(false)
    if (result) { setDebrief(result); setPhase('debrief') }
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

  function tryHarderScenario() {
    const nextIndex = scenarioIndex + 1
    if (nextIndex < module!.scenarios.length) {
      setScenarioIndex(nextIndex)
      setPhase('frame')
      setMessages([])
      setDebrief('')
    }
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  if (phase === 'frame') {
    const difficultyColor: Record<string, string> = {
      low: 'bg-green-50 text-green-700',
      medium: 'bg-amber-50 text-amber-700',
      high: 'bg-red-50 text-red-700',
    }
    const difficultyLabel: Record<string, string> = { low: 'Beginner', medium: 'Intermediate', high: 'Advanced' }

    return (
      <div className="max-w-lg mx-auto px-6 py-12">
        <Link href="/dashboard/skills" className="text-sm text-ink-mid hover:text-ink mb-8 inline-block">← Skill modules</Link>

        <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          {module.title}
        </h1>
        <p className="text-ink-mid text-sm mb-8">{module.description}</p>

        <div className="bg-white border border-border rounded-card p-6 mb-6">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">The skill</p>
          <p className="text-sm text-ink leading-relaxed">{module.frame}</p>
        </div>

        <div className="bg-white border border-border rounded-card p-5 mb-6">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Your scenario</p>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink mb-1">With: {scenario.persona}</p>
              <p className="text-sm text-ink-mid">{scenario.situation}</p>
            </div>
            <span className={`text-xs rounded-pill px-2 py-0.5 shrink-0 ${difficultyColor[scenario.difficulty]}`}>
              {difficultyLabel[scenario.difficulty]}
            </span>
          </div>
          {module.scenarios.length > 1 && scenarioIndex < module.scenarios.length - 1 && (
            <p className="text-xs text-ink-light mt-3">A harder scenario unlocks after you complete this one.</p>
          )}
        </div>

        <button
          onClick={startPractice}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          Start practice
        </button>
      </div>
    )
  }

  // ── Conversation ───────────────────────────────────────────────────────────

  if (phase === 'conversation') {
    return (
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-medium text-ink">{module.title}</h2>
            <p className="text-xs text-ink-light">{scenario.persona}</p>
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

  // ── Debrief ────────────────────────────────────────────────────────────────

  const parts = debrief.split(/\n(?=\d+\.)/).map(s => s.replace(/^\d+\.\s*/, '').trim())
  const [wentWell = '', rephrase = '', alternative = ''] = parts
  const hasHarder = scenarioIndex < module.scenarios.length - 1

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        How did it go?
      </h1>
      <p className="text-ink-mid text-sm mb-8">Beckett&apos;s feedback on your practice.</p>

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

          <div className="flex flex-col gap-3 pt-2">
            {hasHarder && (
              <button
                onClick={tryHarderScenario}
                className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                Try the harder scenario →
              </button>
            )}
            <button
              onClick={() => { setPhase('frame'); setMessages([]); setDebrief('') }}
              className="w-full border border-border rounded-pill py-3 text-sm font-medium text-ink hover:bg-primary-light transition-colors"
            >
              Try again
            </button>
            <Link
              href="/dashboard/skills"
              className="w-full border border-border rounded-pill py-3 text-sm font-medium text-ink text-center hover:bg-primary-light transition-colors"
            >
              ← Back to skill modules
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
