'use client'
import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { SKILL_MODULES, type SkillModule } from '@/lib/skills'

type Phase =
  | 'pre-confidence'
  | 'why-its-hard'
  | 'educational-slides'
  | 'scenario-setup'
  | 'guided-practice'
  | 'freeform-practice'
  | 'post-confidence'
  | 'completion'

type Message = { role: 'user' | 'assistant'; content: string }
type TrustedPerson = { id: string; name: string; relationship: string; communication_style: string; notes: string }
type DebriefData = { other_person_felt: string; how_you_came_across: string; what_went_well: string; things_to_work_on: string }

const qualityStyle: Record<string, string> = {
  good: 'border-green-300 bg-green-50',
  okay: 'border-amber-300 bg-amber-50',
  avoid: 'border-red-300 bg-red-50',
}
const qualityLabel: Record<string, string> = { good: 'Good choice', okay: 'Okay, but…', avoid: 'Avoid this' }
const qualityText: Record<string, string> = { good: 'text-green-700', okay: 'text-amber-700', avoid: 'text-red-700' }

function ProgressMeter({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mt-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full flex-1 transition-colors ${
            i < current ? 'bg-primary' : i === current ? 'bg-primary/40' : 'bg-border'
          }`}
        />
      ))}
    </div>
  )
}

function buildSystemPrompt(mod: SkillModule, familiarity: string, extraContext: string, trustedPerson?: TrustedPerson | null) {
  let prompt = `You are playing the role of ${mod.defaultPersona || 'the other person'} in a practice conversation${mod.medium ? ` via ${mod.medium}` : ''}.
The situation: "${mod.defaultSituation || mod.description}"
The user knows you: ${familiarity}.`
  if (extraContext) prompt += ` Additional context: ${extraContext}`
  if (trustedPerson?.communication_style) {
    prompt += `\n\nCommunication style notes: ${trustedPerson.communication_style}`
    if (trustedPerson.notes) prompt += ` ${trustedPerson.notes}`
  }
  prompt += '\n\nStay in character. Respond realistically — including natural resistance, questions, or reactions.'
  return prompt
}

export default function SkillModulePage() {
  const supabase = createClient()
  const { id } = useParams() as { id: string }
  const skillModule = SKILL_MODULES.find(m => m.id === id)

  const [phase, setPhase] = useState<Phase>('pre-confidence')
  const [preConfidence, setPreConfidence] = useState<number | null>(null)
  const [postConfidence, setPostConfidence] = useState<number | null>(null)

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [checkInAnswer, setCheckInAnswer] = useState('')

  const [familiarity, setFamiliarity] = useState<'not much' | 'a bit' | 'well'>('a bit')
  const [extraContext, setExtraContext] = useState('')
  const [trustedPeople, setTrustedPeople] = useState<TrustedPerson[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('')

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [stepMessages, setStepMessages] = useState<Message[]>([])
  const [pickedOptionIndex, setPickedOptionIndex] = useState<number | null>(null)
  const [stepLoading, setStepLoading] = useState(false)
  const [aiStepMessage, setAiStepMessage] = useState('')

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [debriefLoading, setDebriefLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const completionSaved = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    async function loadTP() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('trusted_people')
          .select('id, name, relationship, communication_style, notes')
          .eq('user_id', user.id)
          .order('name')
        setTrustedPeople((data as TrustedPerson[]) || [])
      } catch { /* table may not exist */ }
    }
    loadTP()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'completion' || completionSaved.current || !skillModule) return
    completionSaved.current = true
    async function save() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('course_completions').upsert(
          {
            user_id: user.id,
            course_id: skillModule!.id,
            pre_confidence: preConfidence,
            post_confidence: postConfidence,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,course_id' }
        )
        fetch('/api/beta-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName: 'course_completed',
            source: 'skill',
            metadata: {
              courseId: skillModule!.id,
              courseTitle: skillModule!.title,
              preConfidence,
              postConfidence,
            },
          }),
        }).catch(() => {})
      } catch { /* table may not exist yet */ }
    }
    save()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (!skillModule) {
    return (
      <div className="max-w-lg">
        <Link href="/dashboard/skills" className="text-sm text-ink-mid hover:text-ink mb-8 inline-block">← Skills</Link>
        <p className="text-ink-mid">Module not found.</p>
      </div>
    )
  }

  const steps = skillModule.steps || []
  const slides = skillModule.educationalSlides
  const selectedTrustedPerson = trustedPeople.find(p => p.id === selectedPersonId) || null

  const totalSlides = slides.length + steps.length + 6
  const currentSlideNum =
    phase === 'pre-confidence' ? 0
    : phase === 'why-its-hard' ? 1
    : phase === 'educational-slides' ? 2 + currentSlideIndex
    : phase === 'scenario-setup' ? 2 + slides.length
    : phase === 'guided-practice' ? 3 + slides.length + currentStepIndex
    : phase === 'freeform-practice' ? 3 + slides.length + steps.length
    : phase === 'post-confidence' ? 4 + slides.length + steps.length
    : 5 + slides.length + steps.length

  async function callAPI(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json() as Record<string, unknown>
  }

  // ── Start practice ─────────────────────────────────────────────────────────

  async function startPractice() {
    if (skillModule!.format === 'in-person') {
      setPhase('freeform-practice')
      return
    }
    if (!steps.length) {
      setPhase('freeform-practice')
      return
    }

    setPhase('guided-practice')
    setCurrentStepIndex(0)
    setStepMessages([])
    setPickedOptionIndex(null)

    const step0 = steps[0]
    if (step0.aiSeed !== undefined) {
      setAiStepMessage(step0.aiSeed)
    } else {
      setStepLoading(true)
      const system = buildSystemPrompt(skillModule!, familiarity, extraContext, selectedTrustedPerson)
      const data = await callAPI({ action: 'turn', system, messages: [{ role: 'user', content: '(start the conversation — send the first message as this person would)' }] })
      setStepLoading(false)
      setAiStepMessage((data.text as string) || '')
    }
  }

  // ── Step: pick option ──────────────────────────────────────────────────────

  function pickOption(optionIndex: number) {
    if (pickedOptionIndex !== null || stepLoading) return
    setPickedOptionIndex(optionIndex)
    const step = steps[currentStepIndex]
    const chosen = step.options[optionIndex]
    const newHistory = [
      ...stepMessages,
      { role: 'assistant' as const, content: aiStepMessage },
      { role: 'user' as const, content: chosen.text },
    ]
    setStepMessages(newHistory)
  }

  async function continueToNextStep() {
    if (currentStepIndex >= steps.length - 1) {
      setMessages(stepMessages)
      setPhase('freeform-practice')
      return
    }

    const nextIndex = currentStepIndex + 1
    setCurrentStepIndex(nextIndex)
    setPickedOptionIndex(null)
    setStepLoading(true)

    const system = buildSystemPrompt(skillModule!, familiarity, extraContext, selectedTrustedPerson)
    const data = await callAPI({ action: 'turn', system, messages: stepMessages })
    setStepLoading(false)
    setAiStepMessage((data.text as string) || '')
  }

  // ── Freeform practice ──────────────────────────────────────────────────────

  async function startOpenPractice() {
    setLoading(true)
    const system = buildSystemPrompt(skillModule!, familiarity, extraContext, selectedTrustedPerson)
    const data = await callAPI({ action: 'turn', system, messages: [{ role: 'user', content: '(start — react naturally as this person would)' }] })
    setLoading(false)
    if (data.text) setMessages([{ role: 'assistant', content: data.text as string }])
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    const system = buildSystemPrompt(skillModule!, familiarity, extraContext, selectedTrustedPerson)
    const data = await callAPI({ action: 'turn', system, messages: next })
    setLoading(false)
    if (data.text) setMessages(prev => [...prev, { role: 'assistant', content: data.text as string }])
    else if (data.error) setError(data.error as string)
  }

  async function endAndDebrief() {
    setPhase('post-confidence')
    setDebriefLoading(true)
    const history = messages
      .map(m => `[${m.role === 'user' ? 'You' : skillModule!.defaultPersona || 'Them'}]: ${m.content}`)
      .join('\n')
    try {
      const data = await callAPI({
        action: 'debrief',
        personDescription: skillModule!.defaultPersona,
        situation: skillModule!.defaultSituation || skillModule!.description,
        goal: skillModule!.description,
        conversationHistory: history,
      })
      if (!data.error) setDebrief(data as DebriefData)
    } catch { /* ignore */ }
    setDebriefLoading(false)
  }

  function resetCourse() {
    setPhase('pre-confidence')
    setPreConfidence(null)
    setPostConfidence(null)
    setCurrentSlideIndex(0)
    setMessages([])
    setStepMessages([])
    setDebrief(null)
    setCurrentStepIndex(0)
    setPickedOptionIndex(null)
    setAiStepMessage('')
    completionSaved.current = false
  }

  // ── Pre-confidence ─────────────────────────────────────────────────────────

  if (phase === 'pre-confidence') {
    return (
      <div className="max-w-lg">
        <Link href="/dashboard/skills" className="text-sm text-ink-mid hover:text-ink mb-6 inline-block">← Skills</Link>
        <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          {skillModule.title}
        </h1>
        <p className="text-ink-mid text-sm mb-8">{skillModule.description}</p>

        <div className="bg-white border border-border rounded-card p-6 mb-6">
          <p className="text-sm font-medium text-ink mb-1">Before we start</p>
          <p className="text-ink-mid text-sm mb-5">How confident do you feel about this skill right now?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setPreConfidence(n)}
                className={`flex-1 py-3 text-sm rounded-pill border transition-colors font-medium ${
                  preConfidence === n
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-ink-light mt-2 px-1">
            <span>Not at all</span>
            <span>Very confident</span>
          </div>
        </div>

        <button
          onClick={() => setPhase('why-its-hard')}
          disabled={preConfidence === null}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          Start course →
        </button>
        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Why it is hard ─────────────────────────────────────────────────────────

  if (phase === 'why-its-hard') {
    return (
      <div className="max-w-lg">
        <button onClick={() => setPhase('pre-confidence')} className="text-sm text-ink-mid hover:text-ink mb-6 inline-block">← Back</button>

        <h2 className="text-2xl text-ink mb-6" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Why this tends to be hard
        </h2>

        <div className="bg-white border border-border rounded-card p-6 mb-6">
          <p className="text-sm text-ink leading-relaxed">
            {skillModule.whyItsHard === 'TODO — add authored content'
              ? 'This section will explain why this skill tends to be harder for neurodivergent brains specifically — not as a failing, but as useful context.'
              : skillModule.whyItsHard}
          </p>
        </div>

        <button
          onClick={() => {
            setCurrentSlideIndex(0)
            setPhase(slides.length > 0 ? 'educational-slides' : 'scenario-setup')
          }}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          Makes sense →
        </button>
        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Educational slides ─────────────────────────────────────────────────────

  if (phase === 'educational-slides') {
    const slide = slides[currentSlideIndex]
    const isLast = currentSlideIndex >= slides.length - 1

    const cardClass =
      slide.type === 'what-not-to-do' ? 'bg-amber-50 border-amber-200'
      : slide.type === 'safety' ? 'bg-blue-50 border-blue-200'
      : slide.type === 'section-check-in' ? 'bg-primary-light border-primary/20'
      : 'bg-white border-border'

    const advanceSlide = () => {
      setCheckInAnswer('')
      if (isLast) {
        setPhase('scenario-setup')
      } else {
        setCurrentSlideIndex(i => i + 1)
      }
    }

    return (
      <div className="max-w-lg">
        <button
          onClick={() => {
            if (currentSlideIndex === 0) setPhase('why-its-hard')
            else setCurrentSlideIndex(i => i - 1)
          }}
          className="text-sm text-ink-mid hover:text-ink mb-6 inline-block"
        >
          ← Back
        </button>

        <div className={`border rounded-card p-6 mb-6 ${cardClass}`}>
          {slide.type === 'what-not-to-do' && (
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-3">What to avoid</p>
          )}
          {slide.type === 'safety' && (
            <p className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-3">Good to know</p>
          )}
          {slide.type === 'section-check-in' && (
            <p className="text-xs font-medium text-primary uppercase tracking-wide mb-3">Check in</p>
          )}

          <h2 className="text-xl text-ink mb-4" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
            {slide.title}
          </h2>

          {slide.body && (
            <p className="text-sm text-ink leading-relaxed">{slide.body}</p>
          )}

          {slide.content && slide.content.length > 0 && (
            <ul className="space-y-2">
              {slide.content.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink leading-relaxed">
                  <span className="text-primary mt-0.5 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.type === 'section-check-in' && slide.checkIn && (
            <div className="mt-4">
              <p className="text-sm text-ink-mid mb-3">{slide.checkIn}</p>
              <textarea
                value={checkInAnswer}
                onChange={e => setCheckInAnswer(e.target.value)}
                placeholder="Optional — just for you, not saved"
                rows={2}
                className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          )}
        </div>

        <button
          onClick={advanceSlide}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          {isLast ? 'Set the scene →' : 'Next →'}
        </button>
        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Scenario setup ─────────────────────────────────────────────────────────

  if (phase === 'scenario-setup') {
    const goBack = () => {
      if (slides.length > 0) {
        setCurrentSlideIndex(slides.length - 1)
        setPhase('educational-slides')
      } else {
        setPhase('why-its-hard')
      }
    }

    return (
      <div className="max-w-lg">
        <button onClick={goBack} className="text-sm text-ink-mid hover:text-ink mb-6 inline-block">← Back</button>

        <h2 className="text-xl text-ink mb-6" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Set the scene
        </h2>

        <div className="bg-white border border-border rounded-card p-5 mb-5">
          <div className="flex gap-2 mb-2 flex-wrap">
            {skillModule.medium && (
              <span className="text-xs font-medium bg-primary-light text-primary rounded-pill px-2 py-0.5">
                {skillModule.medium}
              </span>
            )}
            {skillModule.format === 'in-person' && (
              <span className="text-xs font-medium bg-amber-50 text-amber-700 rounded-pill px-2 py-0.5">
                In person
              </span>
            )}
          </div>
          {skillModule.defaultPersona && (
            <p className="text-sm font-medium text-ink mb-1">With: {skillModule.defaultPersona}</p>
          )}
          {skillModule.defaultSituation && (
            <p className="text-sm text-ink-mid">{skillModule.defaultSituation}</p>
          )}
        </div>

        {skillModule.format !== 'in-person' && (
          <>
            <div className="mb-5">
              <label className="block text-sm font-medium text-ink mb-2">How well do you know this person?</label>
              <div className="flex gap-2">
                {(['not much', 'a bit', 'well'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFamiliarity(f)}
                    className={`flex-1 py-2 text-sm rounded-pill border transition-colors ${
                      familiarity === f
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-ink mb-1">
                Any additional context?{' '}
                <span className="font-normal text-ink-light">(optional)</span>
              </label>
              <textarea
                value={extraContext}
                onChange={e => setExtraContext(e.target.value)}
                placeholder="e.g. We met at a conference last month. The conversation has been going well."
                rows={2}
                className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            {trustedPeople.length > 0 && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-ink mb-1">
                  Is this someone from your Trusted People?{' '}
                  <span className="font-normal text-ink-light">(optional)</span>
                </label>
                <select
                  value={selectedPersonId}
                  onChange={e => setSelectedPersonId(e.target.value)}
                  className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">None</option>
                  {trustedPeople.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.relationship ? ` — ${p.relationship}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {skillModule.format === 'in-person' && (
          <div className="bg-bg border border-border rounded-card p-4 mb-5">
            <p className="text-sm text-ink-mid leading-relaxed">
              This scenario happens in person. Use the context above to prepare for the real conversation.
              Practice sessions will be available here when video lessons launch.
            </p>
          </div>
        )}

        <button
          onClick={startPractice}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          {skillModule.format === 'in-person' ? 'Continue →' : 'Start practice →'}
        </button>
        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Guided practice ────────────────────────────────────────────────────────

  if (phase === 'guided-practice') {
    const step = steps[currentStepIndex]
    const picked = pickedOptionIndex !== null ? step.options[pickedOptionIndex] : null

    return (
      <div className="max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-medium text-ink">{skillModule.title}</h2>
            <p className="text-xs text-ink-light">
              {skillModule.medium} · Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
          {skillModule.medium && (
            <span className="text-xs bg-primary-light text-primary rounded-pill px-2.5 py-1">{skillModule.medium}</span>
          )}
        </div>

        {step.label && (
          <p className="text-xs text-ink-light mb-3">{step.label}</p>
        )}

        {stepLoading ? (
          <div className="bg-white border border-border rounded-card p-4 mb-6">
            <div className="flex gap-1 items-center h-4">
              <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-ink-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : aiStepMessage ? (
          <div className="bg-white border border-border rounded-card p-4 mb-6">
            <p className="text-xs font-medium text-ink-light mb-2">{skillModule.defaultPersona}</p>
            <p className="text-sm text-ink leading-relaxed">{aiStepMessage}</p>
          </div>
        ) : null}

        {!stepLoading && (
          <div className="space-y-3 mb-4">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide">How do you respond?</p>
            {step.options.map((opt, i) => {
              const isPicked = pickedOptionIndex === i
              return (
                <div key={i}>
                  <button
                    onClick={() => pickOption(i)}
                    disabled={pickedOptionIndex !== null}
                    className={`w-full text-left border rounded-card p-4 text-sm transition-colors ${
                      isPicked
                        ? `${qualityStyle[opt.quality]} border-2`
                        : pickedOptionIndex !== null
                        ? 'border-border text-ink-light bg-white opacity-50 cursor-not-allowed'
                        : 'border-border bg-white hover:border-primary text-ink'
                    }`}
                  >
                    {opt.text}
                  </button>
                  {isPicked && (
                    <div className={`mt-2 rounded-sm p-3 border ${qualityStyle[opt.quality]}`}>
                      <p className={`text-xs font-medium mb-1 ${qualityText[opt.quality]}`}>
                        {qualityLabel[opt.quality]}
                      </p>
                      <p className="text-xs text-ink-mid">{opt.note}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {picked && (
          <button
            onClick={continueToNextStep}
            disabled={stepLoading}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {currentStepIndex >= steps.length - 1 ? 'Move to open practice →' : 'Continue →'}
          </button>
        )}

        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Freeform practice ──────────────────────────────────────────────────────

  if (phase === 'freeform-practice') {
    if (skillModule.format === 'in-person') {
      return (
        <div className="max-w-lg">
          <button onClick={() => setPhase('scenario-setup')} className="text-sm text-ink-mid hover:text-ink mb-6 inline-block">← Back</button>

          <div className="bg-amber-50 border border-amber-200 rounded-card p-6 mb-6">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-3">Coming up</p>
            <h2 className="text-xl text-ink mb-3" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
              Video lessons are on the way
            </h2>
            <p className="text-sm text-ink-mid leading-relaxed mb-3">
              This scenario happens face to face. We are building video practice sessions that will let you rehearse it properly — with real-time feedback on tone, pacing, and delivery.
            </p>
            <p className="text-sm text-ink-mid leading-relaxed">
              For now, use what you learned in this course to prepare for the real conversation.
            </p>
          </div>

          <button
            onClick={() => setPhase('post-confidence')}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Complete course →
          </button>
          <ProgressMeter current={currentSlideNum} total={totalSlides} />
        </div>
      )
    }

    const hasSeedMessages = messages.length > 0

    return (
      <div className="max-w-lg flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-base font-medium text-ink">{skillModule.title}</h2>
            <p className="text-xs text-ink-light">{skillModule.defaultPersona}</p>
          </div>
          <button
            onClick={endAndDebrief}
            disabled={loading || messages.length < 2}
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40"
          >
            End + get feedback
          </button>
        </div>

        {!hasSeedMessages && (
          <div className="bg-bg border border-border rounded-card p-5 mb-4 text-center shrink-0">
            <p className="text-sm text-ink-mid mb-3">Open practice — you are in charge now.</p>
            <button
              onClick={startOpenPractice}
              disabled={loading}
              className="bg-primary text-white text-sm rounded-pill px-5 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Starting…' : 'Let them go first'}
            </button>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-3 shrink-0">{error}</p>}

        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
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

  // ── Post-confidence ────────────────────────────────────────────────────────

  if (phase === 'post-confidence') {
    return (
      <div className="max-w-lg">
        <h2 className="text-2xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          One last thing
        </h2>
        <p className="text-ink-mid text-sm mb-8">After everything you just worked through —</p>

        <div className="bg-white border border-border rounded-card p-6 mb-6">
          <p className="text-sm font-medium text-ink mb-1">How confident do you feel about this skill now?</p>
          <p className="text-xs text-ink-light mb-5">You started at {preConfidence}/5</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setPostConfidence(n)}
                className={`flex-1 py-3 text-sm rounded-pill border transition-colors font-medium ${
                  postConfidence === n
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-ink-light mt-2 px-1">
            <span>Not at all</span>
            <span>Very confident</span>
          </div>
        </div>

        <button
          onClick={() => setPhase('completion')}
          disabled={postConfidence === null}
          className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          See results →
        </button>
        <ProgressMeter current={currentSlideNum} total={totalSlides} />
      </div>
    )
  }

  // ── Completion ─────────────────────────────────────────────────────────────

  const confidenceGain = preConfidence !== null && postConfidence !== null ? postConfidence - preConfidence : null

  return (
    <div className="max-w-lg">
      <div className="bg-white border border-border rounded-card p-8 mb-6 text-center">
        <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4 text-primary text-2xl font-bold">
          ✓
        </div>
        <h1 className="text-2xl text-ink mb-1" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Course complete
        </h1>
        <p className="text-ink-mid text-sm">{skillModule.title}</p>

        {preConfidence !== null && postConfidence !== null && (
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-xs text-ink-light mb-2">Confidence</p>
            <p className="text-sm text-ink">
              {preConfidence}/5 → {postConfidence}/5
              {confidenceGain !== null && confidenceGain > 0 && (
                <span className="text-green-600 ml-2">+{confidenceGain}</span>
              )}
              {confidenceGain === 0 && (
                <span className="text-ink-light ml-2">same</span>
              )}
            </p>
          </div>
        )}
      </div>

      {debriefLoading && (
        <div className="bg-white border border-border rounded-card p-5 mb-4 text-center">
          <p className="text-sm text-ink-mid">Loading practice feedback…</p>
        </div>
      )}

      {!debriefLoading && debrief && (
        <div className="space-y-4 mb-6">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide">Practice feedback</p>
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
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={resetCourse}
          className="w-full border border-border rounded-pill py-3 text-sm font-medium text-ink hover:bg-primary-light transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard/skills"
          className="w-full border border-border rounded-pill py-3 text-sm font-medium text-ink text-center hover:bg-primary-light transition-colors"
        >
          ← Back to skills
        </Link>
      </div>
    </div>
  )
}
