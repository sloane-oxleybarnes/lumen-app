'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCourse } from '@/lib/courses'
import type {
  AccordionSlide, ReadThroughSlide, FlipCardsSlide,
  MatchingSlide, InteractiveReadSlide, DraftPracticeSlide,
  SideBySideSlide, SortingSlide, MultipleChoiceSlide, ChecklistSlide,
} from '@/lib/courses'

type Phase = 'confidence-start' | 'slides' | 'guided-practice' | 'open-practice' | 'debrief' | 'confidence-end' | 'completion' | 'review'
type Message = { role: 'user' | 'assistant'; content: string }
type WrongAnswer = {
  slideIndex: number
  itemIndex: number
  slideTitle: string
  scenario: string
  userAnswer: string
  correctAnswer: string
  explanation: string
}
type DebriefData = { other_person_felt: string; how_you_came_across: string; what_went_well: string; things_to_work_on: string }

const PAIR_COLORS = [
  { bg: 'bg-sky-100', border: 'border-sky-400', text: 'text-sky-700' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700' },
]

async function callAPI(body: Record<string, unknown>) {
  const res = await fetch('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function CoursePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const maybeCourse = getCourse(params.id)

  // ── Auth + plan + completion check ──────────────────────────────────────
  const [planError, setPlanError] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      if (profile?.plan !== 'pro' && profile?.plan !== 'beta') {
        setPlanError('Courses require a Pro or Beta plan.')
        return
      }
      if (maybeCourse) {
        const { data: completion } = await supabase.from('course_completions')
          .select('completed_at').eq('user_id', user.id).eq('course_id', maybeCourse.id).maybeSingle()
        if (completion) {
          setIsCompleted(true)
          setCompletedAt(completion.completed_at)
        }
      }
    }
    checkAccess()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Phase + navigation ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('confidence-start')
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [reviewSlideIndex, setReviewSlideIndex] = useState(0)

  // ── Confidence ───────────────────────────────────────────────────────────
  const [preConfidence, setPreConfidence] = useState<number | null>(null)
  const [postConfidence, setPostConfidence] = useState<number | null>(null)
  const [reflectiveAnswer, setReflectiveAnswer] = useState('')

  // ── Wrong answers ────────────────────────────────────────────────────────
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([])
  const [currentWAIndex, setCurrentWAIndex] = useState(0)
  const [miniConvo, setMiniConvo] = useState<Message[] | null>(null)
  const [miniConvoLoading, setMiniConvoLoading] = useState(false)

  // ── Accordion ────────────────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())
  const [checkedSections, setCheckedSections] = useState<Set<number>>(new Set())

  // ── Flip cards ───────────────────────────────────────────────────────────
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set())

  // ── Matching ─────────────────────────────────────────────────────────────
  const [shuffledRight, setShuffledRight] = useState<number[]>([])
  const [matchConns, setMatchConns] = useState<{ left: number; right: number }[]>([])
  const [pendingLeft, setPendingLeft] = useState<number | null>(null)
  const [matchChecked, setMatchChecked] = useState(false)
  const [matchErrors, setMatchErrors] = useState<Set<number>>(new Set())

  // ── Interactive read / Draft practice ────────────────────────────────────
  const [draftInput, setDraftInput] = useState('')
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)

  // ── Sorting ──────────────────────────────────────────────────────────────
  const [sortedItems, setSortedItems] = useState<Record<number, string>>({})
  const [sortingChecked, setSortingChecked] = useState(false)
  const [sortingErrors, setSortingErrors] = useState<Set<number>>(new Set())

  // ── Multiple choice ──────────────────────────────────────────────────────
  const [mcRound, setMcRound] = useState(0)
  const [mcSelected, setMcSelected] = useState<number | null>(null)
  const [mcShowFeedback, setMcShowFeedback] = useState(false)
  const [mcIsWrong, setMcIsWrong] = useState(false)

  // ── Checklist ────────────────────────────────────────────────────────────
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())

  // ── Open practice ────────────────────────────────────────────────────────
  const [practiceMessages, setPracticeMessages] = useState<Message[]>([])
  const [practiceInput, setPracticeInput] = useState('')
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [ghosted, setGhosted] = useState(false)
  const [showGhostOverlay, setShowGhostOverlay] = useState(false)
  const [hardIntervention, setHardIntervention] = useState<string | null>(null)
  const [ghostAnalysis, setGhostAnalysis] = useState<string | null>(null)
  const ghostCheckStrikes = useRef(0)

  // ── Debrief ──────────────────────────────────────────────────────────────
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [debriefLoading, setDebriefLoading] = useState(false)

  // ── Course feedback ──────────────────────────────────────────────────────
  const [courseFeedbackRating, setCourseFeedbackRating] = useState<'yes' | 'no' | null>(null)
  const [courseFeedbackUseful, setCourseFeedbackUseful] = useState('')
  const [courseFeedbackOff, setCourseFeedbackOff] = useState('')
  const [courseFeedbackWouldUse, setCourseFeedbackWouldUse] = useState('')
  const [courseFeedbackSubmitting, setCourseFeedbackSubmitting] = useState(false)
  const [courseFeedbackSubmitted, setCourseFeedbackSubmitted] = useState(false)
  const [courseFeedbackError, setCourseFeedbackError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const completionSaved = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [practiceMessages])

  // Shuffle matching right column when reaching a matching slide
  useEffect(() => {
    if (phase === 'slides' && maybeCourse) {
      const slide = maybeCourse.slides[currentSlideIndex]
      if (slide.type === 'matching') {
        const order = slide.pairs.map((_, i) => i)
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]]
        }
        setShuffledRight(order)
        setMatchConns([])
        setPendingLeft(null)
        setMatchChecked(false)
        setMatchErrors(new Set())
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentSlideIndex, maybeCourse])

  if (!maybeCourse) {
    return <div className="max-w-lg mx-auto py-16 text-center"><p className="text-ink-mid">Course not found.</p></div>
  }

  if (planError) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-ink mb-4">{planError}</p>
        <a href="/pricing" className="text-primary underline text-sm">Upgrade to Pro</a>
      </div>
    )
  }

  // maybeCourse is narrowed to Course past both guards
  const course = maybeCourse

  // ── Progress ───────────────────────────────────────────────────────────────
  const TOTAL_STEPS = course.slides.length + 6
  function currentStep(): number {
    if (phase === 'confidence-start') return 1
    if (phase === 'slides') return 2 + currentSlideIndex
    if (phase === 'guided-practice') return 2 + course.slides.length
    if (phase === 'open-practice') return 3 + course.slides.length
    if (phase === 'debrief') return 4 + course.slides.length
    if (phase === 'confidence-end') return 5 + course.slides.length
    return TOTAL_STEPS
  }
  const progress = phase === 'review'
    ? Math.round(((reviewSlideIndex + 1) / course.slides.length) * 100)
    : Math.round((currentStep() / TOTAL_STEPS) * 100)

  // ── Slide state reset ──────────────────────────────────────────────────────
  function resetSlideState() {
    setExpandedSections(new Set())
    setCheckedSections(new Set())
    setFlippedCards(new Set())
    setMatchConns([])
    setPendingLeft(null)
    setMatchChecked(false)
    setMatchErrors(new Set())
    setDraftInput('')
    setDraftFeedback(null)
    setDraftLoading(false)
    setSortedItems({})
    setSortingChecked(false)
    setSortingErrors(new Set())
    setMcRound(0)
    setMcSelected(null)
    setMcShowFeedback(false)
    setMcIsWrong(false)
    setCheckedItems(new Set())
  }

  // ── Back button ────────────────────────────────────────────────────────────
  function goBack() {
    if (currentSlideIndex > 0) {
      resetSlideState()
      setCurrentSlideIndex(i => i - 1)
    }
  }

  function BackButton({ idx }: { idx: number }) {
    return (
      <button
        onClick={goBack}
        disabled={idx === 0}
        className="flex items-center gap-1 text-xs text-ink-light hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-6"
      >
        ← Back
      </button>
    )
  }

  // ── Advance slide ──────────────────────────────────────────────────────────
  function advanceSlide() {
    resetSlideState()
    if (currentSlideIndex < course.slides.length - 1) {
      setCurrentSlideIndex(i => i + 1)
    } else {
      if (course.reviewWrongAnswers && wrongAnswers.length > 0) {
        setCurrentWAIndex(0)
        setMiniConvo(null)
        setPhase('guided-practice')
      } else {
        setPhase('open-practice')
      }
    }
  }

  // ── Record wrong answer ────────────────────────────────────────────────────
  function recordWrong(wa: WrongAnswer) {
    setWrongAnswers(prev => {
      const exists = prev.some(x => x.slideIndex === wa.slideIndex && x.itemIndex === wa.itemIndex)
      return exists ? prev : [...prev, wa]
    })
  }

  // ── Sorting check ──────────────────────────────────────────────────────────
  function checkSorting() {
    const slide = course.slides[currentSlideIndex] as SortingSlide
    const errors = new Set<number>()
    slide.items.forEach((item, i) => {
      if (sortedItems[i] !== item.correct) errors.add(i)
    })
    setSortingChecked(true)
    setSortingErrors(errors)
    errors.forEach(i => {
      recordWrong({
        slideIndex: currentSlideIndex, itemIndex: i, slideTitle: slide.title,
        scenario: slide.items[i].message, userAnswer: sortedItems[i] || 'unsorted',
        correctAnswer: slide.items[i].correct, explanation: slide.items[i].explanation,
      })
      setSortedItems(prev => { const n = { ...prev }; delete n[i]; return n })
    })
  }

  // ── Multiple choice ────────────────────────────────────────────────────────
  function handleMCSelect(optIdx: number) {
    const slide = course.slides[currentSlideIndex] as MultipleChoiceSlide
    const round = slide.rounds[mcRound]
    const isCorrect = round.options[optIdx].correct
    setMcSelected(optIdx)
    setMcShowFeedback(true)
    setMcIsWrong(!isCorrect)
    if (!isCorrect) {
      recordWrong({
        slideIndex: currentSlideIndex, itemIndex: mcRound, slideTitle: slide.title,
        scenario: round.scenario, userAnswer: round.options[optIdx].text,
        correctAnswer: round.options.find(o => o.correct)?.text || '',
        explanation: round.options[optIdx].explanation,
      })
    }
  }

  function advanceMCRound() {
    const slide = course.slides[currentSlideIndex] as MultipleChoiceSlide
    if (mcRound < slide.rounds.length - 1) {
      setMcRound(r => r + 1)
      setMcSelected(null)
      setMcShowFeedback(false)
      setMcIsWrong(false)
    } else {
      setMcRound(slide.rounds.length)
    }
  }

  // ── Matching ───────────────────────────────────────────────────────────────
  function clickLeft(leftIdx: number) {
    if (matchChecked) return
    const existing = matchConns.find(c => c.left === leftIdx)
    if (existing) { setMatchConns(prev => prev.filter(c => c.left !== leftIdx)); return }
    if (pendingLeft === leftIdx) { setPendingLeft(null); return }
    setPendingLeft(leftIdx)
  }

  function clickRight(rightVisualIdx: number) {
    if (matchChecked) return
    if (pendingLeft === null) {
      const existing = matchConns.find(c => c.right === rightVisualIdx)
      if (existing) setMatchConns(prev => prev.filter(c => c.right !== rightVisualIdx))
      return
    }
    setMatchConns(prev => {
      const filtered = prev.filter(c => c.left !== pendingLeft && c.right !== rightVisualIdx)
      return [...filtered, { left: pendingLeft, right: rightVisualIdx }]
    })
    setPendingLeft(null)
  }

  function checkMatching() {
    const errors = new Set<number>()
    matchConns.forEach(c => {
      if (c.left !== shuffledRight[c.right]) errors.add(c.left)
    })
    setMatchChecked(true)
    setMatchErrors(errors)
  }

  function tryAgainMatching() {
    setMatchConns(prev => prev.filter(c => !matchErrors.has(c.left)))
    setMatchChecked(false)
    setMatchErrors(new Set())
  }

  function getLeftColor(leftIdx: number): (typeof PAIR_COLORS)[0] | null {
    const conn = matchConns.find(c => c.left === leftIdx)
    if (!conn) return null
    return PAIR_COLORS[leftIdx % PAIR_COLORS.length]
  }
  function getRightColor(rightVisualIdx: number): (typeof PAIR_COLORS)[0] | null {
    const conn = matchConns.find(c => c.right === rightVisualIdx)
    if (!conn) return null
    if (matchErrors.has(conn.left)) return null
    return PAIR_COLORS[conn.left % PAIR_COLORS.length]
  }

  // ── Draft feedback ─────────────────────────────────────────────────────────
  async function getDraftFeedback(ctx: string) {
    if (!draftInput.trim() || draftLoading) return
    setDraftLoading(true)
    const data = await callAPI({ action: 'draft_feedback', userMessage: draftInput, draftContext: ctx }) as { note?: string }
    setDraftLoading(false)
    if (data.note) setDraftFeedback(data.note)
  }

  // ── Guided practice ────────────────────────────────────────────────────────
  async function loadMiniConvo(wa: WrongAnswer) {
    setMiniConvoLoading(true)
    const data = await callAPI({
      action: 'mini_convo',
      wrongAnswer: wa.userAnswer, scenario: wa.scenario,
      explanation: wa.explanation, matchName: course.openPractice.matchName,
    }) as { messages?: Message[] }
    setMiniConvoLoading(false)
    if (data.messages?.length) setMiniConvo(data.messages)
  }

  function advanceWA() {
    setMiniConvo(null)
    if (currentWAIndex < wrongAnswers.length - 1) {
      setCurrentWAIndex(i => i + 1)
    } else {
      setPhase('open-practice')
    }
  }

  // ── Open practice ──────────────────────────────────────────────────────────
  async function sendPracticeMessage() {
    if (!practiceInput.trim() || practiceLoading || ghosted) return
    const userMsg: Message = { role: 'user', content: practiceInput.trim() }
    const next = [...practiceMessages, userMsg]
    setPracticeMessages(next)
    setPracticeInput('')
    setPracticeLoading(true)

    const data = await callAPI({
      action: 'turn', system: course.openPractice.systemPrompt, messages: next,
    }) as { text?: string }
    setPracticeLoading(false)

    if (data.text) {
      const withAI = [...next, { role: 'assistant' as const, content: data.text }]
      setPracticeMessages(withAI)

      if (withAI.length >= 4 && withAI.filter(m => m.role === 'user').length % 2 === 0) {
        callAPI({
          action: 'check_ghost', messages: withAI, matchName: course.openPractice.matchName,
        }).then((d: { ghost?: boolean; hardIntervention?: string | null }) => {
          if (d.hardIntervention) {
            setHardIntervention(d.hardIntervention)
            setGhosted(true)
          } else if (d.ghost) {
            ghostCheckStrikes.current += 1
            if (ghostCheckStrikes.current >= 2) {
              setGhosted(true)
              setTimeout(() => {
                setShowGhostOverlay(true)
                loadGhostAnalysis(withAI)
              }, 3500)
            }
          }
        }).catch(() => {})
      }
    }
  }

  async function loadGhostAnalysis(msgs: Message[]) {
    const history = msgs.map(m => `[${m.role === 'user' ? 'You' : course.openPractice.matchName}]: ${m.content}`).join('\n')
    const data = await callAPI({ action: 'ghost_analysis', conversationHistory: history, matchName: course.openPractice.matchName }) as { analysis?: string }
    if (data.analysis) setGhostAnalysis(data.analysis)
  }

  async function endPracticeAndDebrief() {
    if (practiceMessages.length < 2) return
    setDebriefLoading(true)
    const history = practiceMessages.map(m => `[${m.role === 'user' ? 'You' : course.openPractice.matchName}]: ${m.content}`).join('\n')
    const data = await callAPI({ action: 'debrief', conversationHistory: history, matchName: course.openPractice.matchName }) as DebriefData & { error?: string }
    setDebriefLoading(false)
    if (!data.error) { setDebrief(data); setPhase('debrief') }
  }

  // ── Save completion ────────────────────────────────────────────────────────
  async function saveCompletion() {
    if (completionSaved.current || !preConfidence || !postConfidence) return
    completionSaved.current = true
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('course_completions').upsert({
      user_id: user.id, course_id: course.id,
      pre_confidence: preConfidence, post_confidence: postConfidence,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,course_id' })

    fetch('/api/beta-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'course_completed',
        source: 'course',
        metadata: {
          courseId: course.id,
          courseTitle: course.title,
          preConfidence,
          postConfidence,
        },
      }),
    }).catch(() => {})
  }

  async function submitCourseFeedback() {
    if (!courseFeedbackRating || courseFeedbackSubmitting) return
    setCourseFeedbackSubmitting(true)
    setCourseFeedbackError(null)

    const res = await fetch('/api/courses/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: course.id,
        courseTitle: course.title,
        rating: courseFeedbackRating,
        useful: courseFeedbackUseful,
        off: courseFeedbackOff,
        wouldUse: courseFeedbackWouldUse,
        preConfidence,
        postConfidence,
      }),
    })

    setCourseFeedbackSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setCourseFeedbackError(data.error || 'Could not save feedback. Please try again.')
      return
    }

    setCourseFeedbackSubmitted(true)
  }

  // ── Shared UI helpers ──────────────────────────────────────────────────────
  function NextButton({ disabled = false, onClick, label = 'Next →' }: { disabled?: boolean; onClick?: () => void; label?: string }) {
    return (
      <button
        onClick={onClick || advanceSlide}
        disabled={disabled}
        className="mt-8 w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
      >
        {label}
      </button>
    )
  }

  function SlideTitle({ title, description }: { title: string; description?: string }) {
    return (
      <div className="mb-6">
        <h1 className="text-2xl text-ink" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          {title}
        </h1>
        {description && <p className="text-sm text-ink-mid mt-2 leading-relaxed">{description}</p>}
      </div>
    )
  }

  function SideBySideComparison({ comparison }: { comparison: NonNullable<InteractiveReadSlide['comparison']> }) {
    return (
      <div className="mt-8 pt-8 border-t border-border">
        <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Spot the difference</p>
        <p className="text-sm text-ink-mid mb-4 leading-relaxed">{comparison.scenario}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">{comparison.good.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{comparison.good.message}</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">{comparison.good.note}</p>
          </div>
          <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-3">{comparison.bad.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{comparison.bad.message}</p>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{comparison.bad.note}</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Confidence screen ──────────────────────────────────────────────────────
  function renderConfidenceStart() {
    return (
      <div className="max-w-lg mx-auto">
        {isCompleted && (
          <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-card">
            <p className="text-sm text-ink font-medium mb-1">You&apos;ve completed this course</p>
            <p className="text-xs text-ink-mid mb-3">
              Completed {completedAt ? new Date(completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}.
            </p>
            <button
              onClick={() => { setReviewSlideIndex(0); setPhase('review') }}
              className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors"
            >
              Review slides →
            </button>
          </div>
        )}
        <p className="text-xs text-ink-light uppercase tracking-wide mb-4">Before you start</p>
        <p className="text-sm text-ink-mid mb-8 leading-relaxed">{course.confidenceIntro}</p>
        <p className="text-sm text-ink-mid mb-6">{course.confidenceQuestion}</p>
        <div className="flex gap-3 mb-4">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setPreConfidence(n)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                preConfidence === n ? 'bg-primary text-white border-primary' : 'bg-white border-border text-ink-mid hover:border-primary hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-ink-light mb-8">
          <span>Not at all</span>
          <span>Very confident</span>
        </div>
        <NextButton disabled={!preConfidence} onClick={() => setPhase('slides')} label="Start the course →" />
      </div>
    )
  }

  function renderConfidenceEnd() {
    return (
      <div className="max-w-lg mx-auto">
        <p className="text-sm text-ink-mid mb-6">{course.confidenceQuestion}</p>
        <div className="flex gap-3 mb-4">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setPostConfidence(n)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                postConfidence === n ? 'bg-primary text-white border-primary' : 'bg-white border-border text-ink-mid hover:border-primary hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-ink-light mb-6">
          <span>Not at all</span>
          <span>Very confident</span>
        </div>
        {preConfidence && postConfidence && (
          <p className="text-xs text-ink-light mb-6 text-center">
            You started at {preConfidence} out of 5
            {postConfidence > preConfidence ? ` — up ${postConfidence - preConfidence} ${postConfidence - preConfidence === 1 ? 'point' : 'points'}` : ''}
          </p>
        )}
        {postConfidence && (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink mb-3">{course.reflectiveQuestion}</p>
            <textarea
              value={reflectiveAnswer}
              onChange={e => setReflectiveAnswer(e.target.value)}
              rows={3}
              placeholder="Take a moment to reflect…"
              className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-4"
            />
            <button
              onClick={() => { saveCompletion(); setPhase('completion') }}
              disabled={!reflectiveAnswer.trim()}
              className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
            >
              Finish course →
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Slide renderers ────────────────────────────────────────────────────────

  function renderAccordion(slide: AccordionSlide) {
    const allChecked = slide.sections.every((sec, i) => sec.optional || checkedSections.has(i))
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <div className="space-y-2 mb-6">
          {slide.sections.map((sec, i) => {
            const isOpen = expandedSections.has(i)
            const isChecked = checkedSections.has(i)
            return (
              <div key={i} className={`border rounded-xl overflow-hidden transition-colors ${isChecked ? 'border-primary/40 bg-primary/5' : 'border-border bg-white'}`}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedSections(prev => { const s = new Set(prev); if (isOpen) s.delete(i); else s.add(i); return s })}
                >
                  <span className="text-sm font-medium text-ink flex items-center gap-2">
                    {isChecked && <span className="text-primary text-base">✓</span>}
                    {sec.heading}
                    {sec.optional && <span className="text-xs text-ink-light font-normal">Optional</span>}
                  </span>
                  <span className="text-ink-light text-sm">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <ul className="space-y-2 mb-4">
                      {sec.bullets.map((b, j) => (
                        <li key={j} className="text-sm text-ink-mid leading-relaxed flex gap-2">
                          <span className="text-ink-light mt-1 shrink-0">·</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    {!isChecked && (
                      <button
                        onClick={() => setCheckedSections(prev => new Set(prev).add(i))}
                        className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors"
                      >
                        Got it ✓
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!allChecked && (
          <p className="text-xs text-ink-light text-center mb-2">Open and check the required coaching sections to continue.</p>
        )}
        <NextButton disabled={!allChecked} />
      </div>
    )
  }

  function renderReadThrough(slide: ReadThroughSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        {slide.intro && <p className="text-sm text-ink-mid mb-6 leading-relaxed">{slide.intro}</p>}
        {slide.bullets && (
          <ul className="space-y-3 mb-8">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink leading-relaxed">
                <span className="text-primary mt-1 shrink-0">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {slide.stats && (
          <div className="space-y-3 mb-6">
            {slide.stats.map((s, i) => (
              <div key={i} className="bg-bg border border-border rounded-card p-4">
                <p className="text-sm text-ink leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        )}
        <NextButton />
      </div>
    )
  }

  function renderFlipCards(slide: FlipCardsSlide) {
    const allFlipped = flippedCards.size === slide.cards.length
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <p className="text-xs text-ink-light mb-5">Tap each card to flip it.</p>
        <div className="grid gap-4 mb-6">
          {slide.cards.map((card, i) => {
            const flipped = flippedCards.has(i)
            return (
              <div
                key={i}
                onClick={() => setFlippedCards(prev => new Set(prev).add(i))}
                className={`cursor-pointer border-2 rounded-xl p-6 transition-all duration-200 ${
                  flipped ? 'bg-primary/5 border-primary' : 'bg-white border-border hover:border-primary'
                }`}
              >
                {flipped ? (
                  <div>
                    <p className="text-xs font-medium text-primary uppercase tracking-wide mb-3">{card.front}</p>
                    <ul className="space-y-2">
                      {card.back.map((b, j) => (
                        <li key={j} className="text-sm text-ink leading-relaxed flex gap-2">
                          <span className="text-primary shrink-0 mt-0.5">·</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-lg font-medium text-ink mb-2">{card.front}</p>
                    <p className="text-xs text-ink-light">Tap to flip</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <NextButton disabled={!allFlipped} />
      </div>
    )
  }

  function renderMatching(slide: MatchingSlide) {
    const allConnected = matchConns.length === slide.pairs.length
    const canCheck = allConnected && !matchChecked
    const allCorrect = matchChecked && matchErrors.size === 0 && allConnected
    const hasErrors = matchChecked && matchErrors.size > 0

    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <p className="text-xs text-ink-light mb-5">{slide.instruction}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Left column */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide text-center">People</p>
            {slide.pairs.map((pair, i) => {
              const color = getLeftColor(i)
              const isPending = pendingLeft === i
              const hasError = matchErrors.has(i)
              return (
                <button
                  key={i}
                  onClick={() => clickLeft(i)}
                  className={`w-full text-left rounded-xl p-3 border-2 transition-all text-sm ${
                    hasError ? 'border-red-400 bg-red-50' :
                    isPending ? 'border-primary bg-primary/5' :
                    color ? `${color.bg} ${color.border}` :
                    'border-border bg-white hover:border-primary'
                  }`}
                >
                  <p className="font-medium text-ink text-xs mb-1">{pair.left.name}</p>
                  <p className="text-ink-mid" style={{ fontSize: '11px', lineHeight: '1.4' }}>{pair.left.description}</p>
                  {color && !hasError && (
                    <span className={`inline-block mt-1.5 w-3 h-3 rounded-full ${color.bg.replace('100', '400')}`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Right column (shuffled) */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide text-center">Matches</p>
            {shuffledRight.map((pairIdx, visualIdx) => {
              const pair = slide.pairs[pairIdx]
              const color = getRightColor(visualIdx)
              const conn = matchConns.find(c => c.right === visualIdx)
              const hasError = conn ? matchErrors.has(conn.left) : false
              const wrongLeftPair = hasError && conn ? slide.pairs[conn.left] : null
              return (
                <div key={visualIdx} className="space-y-1">
                  <button
                    onClick={() => clickRight(visualIdx)}
                    className={`w-full text-left rounded-xl p-3 border-2 transition-all text-sm ${
                      hasError ? 'border-red-400 bg-red-50' :
                      color ? `${color.bg} ${color.border}` :
                      'border-border bg-white hover:border-primary'
                    }`}
                  >
                    <p className="font-medium text-ink text-xs mb-1">{pair.right.name}</p>
                    <p className="text-ink-mid" style={{ fontSize: '11px', lineHeight: '1.4' }}>{pair.right.description}</p>
                    {color && !hasError && (
                      <span className={`inline-block mt-1.5 w-3 h-3 rounded-full ${color.bg.replace('100', '400')}`} />
                    )}
                  </button>
                  {hasError && wrongLeftPair?.left.mismatchNote && (
                    <p className="text-xs text-red-600 leading-relaxed px-1">{wrongLeftPair.left.mismatchNote}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {pendingLeft !== null && !matchChecked && (
          <p className="text-xs text-primary text-center mb-3">
            {slide.pairs[pendingLeft].left.name} selected — now tap their match →
          </p>
        )}

        <div className="space-y-2 mb-2">
          {!allCorrect && (
            <button
              onClick={checkMatching}
              disabled={!canCheck}
              className="w-full border border-primary text-primary rounded-pill py-2.5 text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-40"
            >
              Check answers
            </button>
          )}
          {hasErrors && (
            <button
              onClick={tryAgainMatching}
              className="w-full border border-border text-ink-mid rounded-pill py-2.5 text-sm font-medium hover:border-primary hover:text-ink transition-colors"
            >
              Try again
            </button>
          )}
        </div>
        <NextButton disabled={!allCorrect} />
      </div>
    )
  }

  function renderInteractiveRead(slide: InteractiveReadSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <div className="space-y-8 mb-8">
          {slide.sections.map((sec, i) => (
            <div key={i}>
              <h2 className="text-base font-semibold text-ink mb-3">{sec.heading}</h2>
              <ul className="space-y-2 mb-4">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="text-sm text-ink leading-relaxed flex gap-2">
                    <span className="text-primary mt-1 shrink-0">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {sec.examples && (
                <div>
                  <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Examples</p>
                  <div className="space-y-2">
                    {sec.examples.map((ex, k) => (
                      <div key={k} className="bg-bg border border-border rounded-card px-4 py-2.5">
                        <p className="text-sm text-ink-mid italic">{ex}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {slide.comparison && <SideBySideComparison comparison={slide.comparison} />}

        {slide.draftPrompt && slide.draftContext && (
          <div className="border border-border rounded-xl p-4 mt-8 mb-2 bg-white">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Try it yourself</p>
            <p className="text-sm text-ink mb-3">{slide.draftPrompt}</p>
            <textarea
              value={draftInput}
              onChange={e => { setDraftInput(e.target.value); setDraftFeedback(null) }}
              rows={3}
              placeholder="Write your message here…"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-3"
            />
            <button
              onClick={() => getDraftFeedback(slide.draftContext!)}
              disabled={!draftInput.trim() || draftLoading}
              className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40"
            >
              {draftLoading ? '…' : 'Get Beckett\'s feedback'}
            </button>
            {draftFeedback && (
              <div className="mt-3 bg-primary/5 border border-primary/20 rounded-card p-3">
                <p className="text-xs text-ink-mid"><span className="text-ink font-medium">Beckett:</span> {draftFeedback}</p>
              </div>
            )}
          </div>
        )}

        <NextButton />
      </div>
    )
  }

  function renderDraftPractice(slide: DraftPracticeSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        <div className="border border-border rounded-xl p-6 bg-white">
          <p className="text-sm text-ink mb-4 leading-relaxed">{slide.prompt}</p>
          <textarea
            value={draftInput}
            onChange={e => { setDraftInput(e.target.value); setDraftFeedback(null) }}
            rows={4}
            placeholder="Write your message here…"
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-3"
          />
          <button
            onClick={() => getDraftFeedback(slide.draftContext)}
            disabled={!draftInput.trim() || draftLoading}
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40"
          >
            {draftLoading ? '…' : 'Get Beckett\'s feedback'}
          </button>
          {draftFeedback && (
            <div className="mt-3 bg-primary/5 border border-primary/20 rounded-card p-3">
              <p className="text-xs text-ink-mid"><span className="text-ink font-medium">Beckett:</span> {draftFeedback}</p>
            </div>
          )}
        </div>
        <NextButton />
      </div>
    )
  }

  function renderSideBySide(slide: SideBySideSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        <p className="text-sm text-ink-mid mb-6 leading-relaxed">{slide.scenario}</p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">{slide.good.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{slide.good.message}</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">{slide.good.note}</p>
          </div>
          <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-3">{slide.bad.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{slide.bad.message}</p>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{slide.bad.note}</p>
          </div>
        </div>
        <NextButton />
      </div>
    )
  }

  function renderSorting(slide: SortingSlide) {
    const allSorted = Object.keys(sortedItems).length === slide.items.length
    const allCorrect = sortingChecked && sortingErrors.size === 0 && allSorted
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        <p className="text-sm text-ink-mid mb-5">{slide.instruction}</p>
        <div className="space-y-3 mb-6">
          {slide.items.map((item, i) => {
            const assigned = sortedItems[i]
            const hasError = sortingErrors.has(i)
            return (
              <div
                key={i}
                className={`border-2 rounded-xl p-4 transition-colors ${
                  hasError ? 'border-red-300 bg-red-50' :
                  sortingChecked && assigned === 'Good ask' ? 'border-green-300 bg-green-50' :
                  sortingChecked && assigned ? 'border-amber-300 bg-amber-50' :
                  'border-border bg-white'
                }`}
              >
                <p className="text-sm text-ink mb-3 leading-relaxed">{item.message}</p>
                <div className="flex gap-2">
                  {slide.categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSortedItems(prev => ({ ...prev, [i]: cat }))
                        setSortingChecked(false)
                        setSortingErrors(prev => { const s = new Set(prev); s.delete(i); return s })
                      }}
                      className={`text-xs rounded-pill px-3 py-1 border transition-colors ${
                        assigned === cat
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {hasError && <p className="text-xs text-red-600 mt-2">{item.explanation}</p>}
                {sortingChecked && !hasError && assigned === item.correct && (
                  <p className="text-xs text-green-700 mt-2">✓ {item.explanation}</p>
                )}
              </div>
            )
          })}
        </div>
        {!allCorrect && (
          <button
            onClick={checkSorting}
            disabled={!allSorted}
            className="w-full border border-primary text-primary rounded-pill py-2.5 text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-40 mb-3"
          >
            {sortingChecked && sortingErrors.size > 0 ? `Fix ${sortingErrors.size} incorrect → re-check` : 'Check my answers'}
          </button>
        )}
        <NextButton disabled={!allCorrect} />
      </div>
    )
  }

  function renderMultipleChoice(slide: MultipleChoiceSlide) {
    const allDone = mcRound >= slide.rounds.length
    if (allDone) {
      return (
        <div>
          <BackButton idx={currentSlideIndex} />
          <SlideTitle title={slide.title} />
          <div className="text-center py-12">
            <p className="text-3xl mb-3">✓</p>
            <p className="text-ink font-medium">All done</p>
          </div>
          <NextButton label="Continue →" />
        </div>
      )
    }
    const round = slide.rounds[mcRound]
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        <div className="mb-2 flex gap-1">
          {slide.rounds.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i < mcRound ? 'bg-primary' : i === mcRound ? 'bg-primary/40' : 'bg-gray-200'}`} />
          ))}
        </div>
        <p className="text-xs text-ink-light mb-5">Round {mcRound + 1} of {slide.rounds.length}</p>
        <div className="bg-bg border border-border rounded-card p-4 mb-5">
          <p className="text-sm text-ink leading-relaxed">{round.scenario}</p>
        </div>
        <div className="space-y-3 mb-6">
          {round.options.map((opt, i) => {
            const isSelected = mcSelected === i
            const showResult = mcShowFeedback && isSelected
            const isCorrect = opt.correct
            return (
              <div key={i}>
                <button
                  onClick={() => {
                    if (!mcShowFeedback) handleMCSelect(i)
                    else if (mcIsWrong && isCorrect) advanceMCRound()
                  }}
                  disabled={mcShowFeedback && !mcIsWrong}
                  className={`w-full text-left border-2 rounded-xl px-4 py-3 text-sm transition-colors ${
                    showResult && !mcIsWrong ? 'border-green-400 bg-green-50 text-ink' :
                    showResult && mcIsWrong ? 'border-red-400 bg-red-50 text-ink' :
                    mcShowFeedback && mcIsWrong && isCorrect ? 'border-primary/50 bg-primary/5 text-ink cursor-pointer' :
                    mcShowFeedback ? 'border-border text-ink-light cursor-default' :
                    'border-border bg-white text-ink hover:border-primary'
                  }`}
                >
                  {opt.text}
                  {mcShowFeedback && mcIsWrong && isCorrect && !isSelected && (
                    <span className="ml-2 text-xs text-primary">← tap to continue</span>
                  )}
                </button>
                {showResult && (
                  <p className={`text-xs mt-1 px-1 leading-relaxed ${mcIsWrong ? 'text-red-600' : 'text-green-700'}`}>
                    {mcIsWrong ? '✗ ' : '✓ '}{opt.explanation}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {!mcShowFeedback && <p className="text-xs text-ink-light text-center">Choose the best option.</p>}
        {mcShowFeedback && !mcIsWrong && (
          <button
            onClick={advanceMCRound}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            {mcRound < slide.rounds.length - 1 ? 'Next round →' : 'Done →'}
          </button>
        )}
      </div>
    )
  }

  function renderChecklist(slide: ChecklistSlide) {
    const allChecked = checkedItems.size === slide.items.length
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} />
        <p className="text-xs text-ink-light mb-5">Tap each item to check it off.</p>
        <div className="space-y-2 mb-6">
          {slide.items.map((item, i) => {
            const checked = checkedItems.has(i)
            return (
              <button
                key={i}
                onClick={() => setCheckedItems(prev => { const s = new Set(prev); if (checked) s.delete(i); else s.add(i); return s })}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 border-2 rounded-xl transition-colors ${
                  checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-white hover:border-primary'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? 'bg-primary border-primary' : 'border-border'
                }`}>
                  {checked && <span className="text-white text-xs">✓</span>}
                </div>
                <span className={`text-sm ${checked ? 'text-ink-mid line-through' : 'text-ink'}`}>{item}</span>
              </button>
            )
          })}
        </div>
        <NextButton disabled={!allChecked} />
      </div>
    )
  }

  function renderSlide() {
    const slide = course.slides[currentSlideIndex]
    switch (slide.type) {
      case 'accordion': return renderAccordion(slide)
      case 'read-through': return renderReadThrough(slide)
      case 'flip-cards': return renderFlipCards(slide)
      case 'matching': return renderMatching(slide)
      case 'interactive-read': return renderInteractiveRead(slide)
      case 'draft-practice': return renderDraftPractice(slide)
      case 'side-by-side': return renderSideBySide(slide)
      case 'sorting': return renderSorting(slide)
      case 'multiple-choice': return renderMultipleChoice(slide)
      case 'checklist': return renderChecklist(slide)
    }
  }

  // ── Review mode (read-only slide browser) ─────────────────────────────────
  function renderSlideReview() {
    const slide = course.slides[reviewSlideIndex]
    const isFirst = reviewSlideIndex === 0
    const isLast = reviewSlideIndex === course.slides.length - 1

    let content: React.ReactNode = null

    switch (slide.type) {
      case 'accordion': {
        const s = slide as AccordionSlide
        content = (
          <div className="space-y-3">
            {s.description && <p className="text-sm text-ink-mid mb-4 leading-relaxed">{s.description}</p>}
            {s.sections.map((sec, i) => (
              <div key={i} className="border border-primary/30 bg-primary/5 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-ink mb-2">✓ {sec.heading}</p>
                <ul className="space-y-1">
                  {sec.bullets.map((b, j) => (
                    <li key={j} className="text-sm text-ink-mid leading-relaxed flex gap-2">
                      <span className="text-ink-light shrink-0">·</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
        break
      }
      case 'read-through': {
        const s = slide as ReadThroughSlide
        content = (
          <div>
            {s.intro && <p className="text-sm text-ink-mid mb-6 leading-relaxed">{s.intro}</p>}
            {s.bullets && (
              <ul className="space-y-3 mb-6">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink leading-relaxed">
                    <span className="text-primary mt-1 shrink-0">·</span><span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.stats && (
              <div className="space-y-3">
                {s.stats.map((st, i) => (
                  <div key={i} className="bg-bg border border-border rounded-card p-4">
                    <p className="text-sm text-ink leading-relaxed">{st}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
        break
      }
      case 'flip-cards': {
        const s = slide as FlipCardsSlide
        content = (
          <div>
            {s.description && <p className="text-sm text-ink-mid mb-4 leading-relaxed">{s.description}</p>}
            <div className="grid gap-4">
              {s.cards.map((card, i) => (
                <div key={i} className="border-2 border-primary bg-primary/5 rounded-xl p-6">
                  <p className="text-xs font-medium text-primary uppercase tracking-wide mb-3">{card.front}</p>
                  <ul className="space-y-2">
                    {card.back.map((b, j) => (
                      <li key={j} className="text-sm text-ink leading-relaxed flex gap-2">
                        <span className="text-primary shrink-0 mt-0.5">·</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )
        break
      }
      case 'matching': {
        const s = slide as MatchingSlide
        content = (
          <div>
            {s.description && <p className="text-sm text-ink-mid mb-4 leading-relaxed">{s.description}</p>}
            <div className="space-y-3">
              {s.pairs.map((pair, i) => (
                <div key={i} className={`border-2 rounded-xl p-4 ${Object.values(PAIR_COLORS)[i % PAIR_COLORS.length].bg} ${Object.values(PAIR_COLORS)[i % PAIR_COLORS.length].border}`}>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-ink-light uppercase mb-1">Person</p>
                      <p className="text-xs font-semibold text-ink">{pair.left.name}</p>
                    </div>
                    <div className="text-ink-light text-lg flex items-center">↔</div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-ink-light uppercase mb-1">Match</p>
                      <p className="text-xs font-semibold text-ink">{pair.right.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
        break
      }
      case 'interactive-read': {
        const s = slide as InteractiveReadSlide
        content = (
          <div>
            {s.description && <p className="text-sm text-ink-mid mb-6 leading-relaxed">{s.description}</p>}
            <div className="space-y-8">
              {s.sections.map((sec, i) => (
                <div key={i}>
                  <h2 className="text-base font-semibold text-ink mb-3">{sec.heading}</h2>
                  <ul className="space-y-2 mb-4">
                    {sec.bullets.map((b, j) => (
                      <li key={j} className="text-sm text-ink leading-relaxed flex gap-2">
                        <span className="text-primary mt-1 shrink-0">·</span><span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {sec.examples && (
                    <div>
                      <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Examples</p>
                      <div className="space-y-2">
                        {sec.examples.map((ex, k) => (
                          <div key={k} className="bg-bg border border-border rounded-card px-4 py-2.5">
                            <p className="text-sm text-ink-mid italic">{ex}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {s.comparison && <SideBySideComparison comparison={s.comparison} />}
            </div>
          </div>
        )
        break
      }
      case 'draft-practice': {
        const s = slide as DraftPracticeSlide
        content = (
          <div className="border border-border rounded-xl p-6 bg-bg">
            <p className="text-sm text-ink-mid leading-relaxed">{s.prompt}</p>
            <p className="text-xs text-ink-light mt-4">Practice mode — interactive in the full course.</p>
          </div>
        )
        break
      }
      case 'side-by-side': {
        const s = slide as SideBySideSlide
        content = (
          <div>
            <p className="text-sm text-ink-mid mb-6 leading-relaxed">{s.scenario}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">{s.good.label}</p>
                <div className="bg-white rounded-xl px-4 py-3 mb-3">
                  <p className="text-sm text-ink leading-relaxed">{s.good.message}</p>
                </div>
                <p className="text-xs text-green-700 leading-relaxed">{s.good.note}</p>
              </div>
              <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-3">{s.bad.label}</p>
                <div className="bg-white rounded-xl px-4 py-3 mb-3">
                  <p className="text-sm text-ink leading-relaxed">{s.bad.message}</p>
                </div>
                <p className="text-xs text-red-600 leading-relaxed">{s.bad.note}</p>
              </div>
            </div>
          </div>
        )
        break
      }
      case 'sorting': {
        const s = slide as SortingSlide
        content = (
          <div className="space-y-3">
            {s.items.map((item, i) => (
              <div key={i} className={`border-2 rounded-xl p-4 ${item.correct === 'Good ask' ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                <p className="text-sm text-ink mb-1 leading-relaxed">{item.message}</p>
                <span className={`text-xs font-medium ${item.correct === 'Good ask' ? 'text-green-700' : 'text-amber-700'}`}>{item.correct}</span>
                <p className="text-xs text-ink-mid mt-1">{item.explanation}</p>
              </div>
            ))}
          </div>
        )
        break
      }
      case 'multiple-choice': {
        const s = slide as MultipleChoiceSlide
        content = (
          <div className="space-y-6">
            {s.rounds.map((round, i) => {
              const correct = round.options.find(o => o.correct)
              return (
                <div key={i} className="border border-border rounded-xl p-4">
                  <p className="text-xs font-medium text-ink-light uppercase mb-2">Round {i + 1}</p>
                  <p className="text-sm text-ink mb-3 leading-relaxed">{round.scenario}</p>
                  {correct && (
                    <div className="border border-green-300 bg-green-50 rounded-xl px-4 py-2.5">
                      <p className="text-sm text-ink">{correct.text}</p>
                      <p className="text-xs text-green-700 mt-1">{correct.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
        break
      }
      case 'checklist': {
        const s = slide as ChecklistSlide
        content = (
          <div className="space-y-2">
            {s.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-2 border-primary/40 bg-primary/5 rounded-xl">
                <div className="w-5 h-5 rounded border-2 bg-primary border-primary flex items-center justify-center shrink-0">
                  <span className="text-white text-xs">✓</span>
                </div>
                <span className="text-sm text-ink-mid line-through">{item}</span>
              </div>
            ))}
          </div>
        )
        break
      }
    }

    return (
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <p className="text-xs text-ink-light mb-1">Slide {reviewSlideIndex + 1} of {course.slides.length}</p>
          <h1 className="text-2xl text-ink" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
            {slide.title}
          </h1>
        </div>
        {content}
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => setReviewSlideIndex(i => Math.max(0, i - 1))}
            disabled={isFirst}
            className="flex-1 border border-border rounded-pill py-3 text-sm font-medium text-ink-mid hover:border-primary hover:text-ink transition-colors disabled:opacity-30"
          >
            ← Previous
          </button>
          {isLast ? (
            <button
              onClick={() => setPhase('confidence-start')}
              className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Done reviewing
            </button>
          ) : (
            <button
              onClick={() => setReviewSlideIndex(i => i + 1)}
              className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Guided practice ────────────────────────────────────────────────────────
  function renderGuidedPractice() {
    if (wrongAnswers.length === 0) {
      setPhase('open-practice')
      return null
    }
    const wa = wrongAnswers[currentWAIndex]
    return (
      <div className="max-w-lg mx-auto">
        <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-1">Before we practice</p>
        <h1 className="text-2xl text-ink mb-6" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Let&apos;s revisit a few things
        </h1>
        <p className="text-xs text-ink-light mb-6">{currentWAIndex + 1} of {wrongAnswers.length}</p>

        <div className="bg-white border border-border rounded-card p-5 mb-4">
          <p className="text-xs text-ink-light uppercase mb-2 tracking-wide">The question</p>
          <p className="text-sm text-ink mb-4 leading-relaxed">{wa.scenario}</p>
          <div className="bg-red-50 border border-red-200 rounded-card p-3 mb-3">
            <p className="text-xs font-medium text-red-600 mb-1">You chose</p>
            <p className="text-sm text-ink">{wa.userAnswer}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-card p-3">
            <p className="text-xs font-medium text-green-700 mb-1">Better approach</p>
            <p className="text-sm text-ink mb-1">{wa.correctAnswer}</p>
            <p className="text-xs text-green-700 leading-relaxed">{wa.explanation}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={() => loadMiniConvo(wa)}
            disabled={miniConvoLoading || !!miniConvo}
            className="flex-1 border border-border text-ink-mid rounded-pill py-2.5 text-sm hover:border-primary hover:text-ink transition-colors disabled:opacity-40"
          >
            {miniConvoLoading ? '…' : 'See how this plays out'}
          </button>
          <button onClick={advanceWA} className="flex-1 bg-primary text-white rounded-pill py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors">
            Got it →
          </button>
        </div>

        {miniConvo && (
          <div className="bg-gray-50 border border-border rounded-xl p-4 mb-4">
            <p className="text-xs text-ink-light uppercase tracking-wide mb-3">What might happen</p>
            <div className="space-y-2">
              {miniConvo.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-white border border-border text-ink rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={advanceWA} className="mt-4 w-full bg-primary text-white rounded-pill py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors">
              Got it →
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Open practice ──────────────────────────────────────────────────────────
  function renderOpenPractice() {
    const { matchName } = course.openPractice
    const canEnd = practiceMessages.length >= 2 && !debriefLoading

    return (
      <div className="max-w-lg mx-auto flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="flex items-center gap-3 pb-3 mb-3 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm shrink-0">
            {matchName[0]}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{matchName}</p>
            <p className="text-xs text-ink-light">Dating app match · 4 days of chatting</p>
          </div>
          <button
            onClick={endPracticeAndDebrief}
            disabled={!canEnd}
            className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors disabled:opacity-40 shrink-0"
          >
            {debriefLoading ? '…' : 'End + review'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {practiceMessages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Your goal</p>
              <p className="text-sm text-ink-mid">
                Ask Jamie out clearly, warmly, and without pressure. Beckett will coach the outcome.
              </p>
            </div>
          )}
          {practiceMessages.map((m, i) => {
            const isLast = i === practiceMessages.length - 1
            return (
              <div key={i}>
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-blue-500 text-white rounded-br-sm' : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
                {m.role === 'user' && isLast && (
                  <div className="flex justify-end mt-0.5">
                    <p className="text-xs text-ink-light pr-1">Delivered</p>
                  </div>
                )}
              </div>
            )
          })}
          {practiceLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          {showGhostOverlay && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-ink-light italic">
                Jamie stopped responding. This is practice, not a judgment.
              </p>
              <div className="bg-white border border-border rounded-card p-4 text-left">
                <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Beckett</p>
                {ghostAnalysis ? <p className="text-sm text-ink leading-relaxed">{ghostAnalysis}</p> : <p className="text-xs text-ink-light">Analyzing…</p>}
              </div>
              {ghostAnalysis && (
                <button onClick={endPracticeAndDebrief} className="bg-primary text-white rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors">
                  Get your full debrief →
                </button>
              )}
            </div>
          )}
          {hardIntervention && (
            <div className="bg-red-50 border border-red-200 rounded-card p-4 text-center space-y-3">
              <p className="text-xs font-medium text-red-600 uppercase">Beckett stepped in</p>
              <p className="text-sm text-ink leading-relaxed">{hardIntervention}</p>
              <button onClick={endPracticeAndDebrief} className="bg-primary text-white rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors">End session</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!ghosted && !hardIntervention && (
          <div className="flex gap-2 shrink-0">
            <input
              type="text" value={practiceInput}
              onChange={e => setPracticeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendPracticeMessage() }}
              placeholder={`Message ${matchName}…`}
              disabled={practiceLoading}
              className="flex-1 border border-border rounded-pill px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={sendPracticeMessage}
              disabled={practiceLoading || !practiceInput.trim()}
              className="bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0"
            >
              ↑
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Debrief ────────────────────────────────────────────────────────────────
  function renderDebrief() {
    if (debriefLoading || !debrief) {
      return <div className="max-w-lg mx-auto text-center py-16"><p className="text-ink-mid text-sm">Generating your feedback…</p></div>
    }
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>How did it go?</h1>
        <p className="text-ink-mid text-sm mb-8">Honest feedback from Beckett.</p>
        <div className="space-y-4 mb-8">
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
        <div className="space-y-3">
          <button
            onClick={() => {
              setPracticeMessages([])
              setPracticeInput('')
              setGhosted(false)
              setShowGhostOverlay(false)
              setHardIntervention(null)
              setGhostAnalysis(null)
              setDebrief(null)
              ghostCheckStrikes.current = 0
              setPhase('open-practice')
            }}
            className="w-full border border-primary text-primary rounded-pill py-3 text-sm font-medium hover:bg-primary-light transition-colors"
          >
            Try again with Beckett&apos;s advice
          </button>
          <button onClick={() => setPhase('confidence-end')} className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors">
            Continue →
          </button>
        </div>
      </div>
    )
  }

  // ── Completion ─────────────────────────────────────────────────────────────
  function renderCompletion() {
    const gain = preConfidence && postConfidence ? postConfidence - preConfidence : null
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="text-center">
        <h1 className="text-3xl text-ink mb-4" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Course complete</h1>
        {gain !== null && gain > 0 && (
          <p className="text-ink-mid text-sm mb-4">Your confidence went from {preConfidence} to {postConfidence} out of 5.</p>
        )}
        <p className="text-ink-mid text-sm mb-8 leading-relaxed">You&apos;ve got the tools. The only thing left is to use them.</p>
        </div>

        <div className="bg-white border border-border rounded-card p-5 mb-8 text-left">
          {courseFeedbackSubmitted ? (
            <div>
              <p className="text-sm font-medium text-ink mb-2">Thanks — this helps us make Beckett better.</p>
              <p className="text-sm text-ink-mid leading-relaxed">We&apos;ll use this to tune the course before more beta users go through it.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-ink mb-2">How was this course?</p>
              <p className="text-sm text-ink-mid mb-4 leading-relaxed">A quick note helps Beckett learn which coaching moments are actually useful.</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { value: 'yes', label: 'Useful' },
                  { value: 'no', label: 'Needs work' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCourseFeedbackRating(option.value as 'yes' | 'no')}
                    className={`rounded-sm border px-4 py-2.5 text-sm font-medium transition-colors ${
                      courseFeedbackRating === option.value
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border text-ink-mid hover:border-primary hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <CourseFeedbackTextarea
                  label="What felt most useful?"
                  value={courseFeedbackUseful}
                  onChange={setCourseFeedbackUseful}
                  placeholder="A section, prompt, example, or practice moment."
                />
                <CourseFeedbackTextarea
                  label="Where did Beckett feel too much, too vague, or off?"
                  value={courseFeedbackOff}
                  onChange={setCourseFeedbackOff}
                  placeholder="Anything that felt confusing, intense, generic, or wrong."
                />
                <CourseFeedbackTextarea
                  label="Would you use this before the real situation?"
                  value={courseFeedbackWouldUse}
                  onChange={setCourseFeedbackWouldUse}
                  placeholder="Yes, no, maybe — and why."
                />
              </div>

              {courseFeedbackError && <p className="text-xs text-red-600 mt-3">{courseFeedbackError}</p>}

              <button
                type="button"
                onClick={submitCourseFeedback}
                disabled={!courseFeedbackRating || courseFeedbackSubmitting}
                className="mt-4 w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
              >
                {courseFeedbackSubmitting ? 'Saving…' : 'Send course feedback'}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <a href="/dashboard/skills" className="border border-border rounded-pill px-5 py-3 text-sm font-medium text-ink hover:bg-primary-light transition-colors">Back to skills</a>
          <a href="/dashboard/practice" className="bg-primary text-white rounded-pill px-5 py-3 text-sm font-medium hover:bg-primary-dark transition-colors">Practice more</a>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {/* Sticky course title header */}
      <div className="sticky top-0 z-20 bg-white border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            {course.id === 'ask-someone-out' && (
              <span className="rounded-pill bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                Personal Preview
              </span>
            )}
            <p className="text-sm font-medium text-ink truncate">{course.title}</p>
          </div>
        </div>
      </div>

      {/* Review mode banner */}
      {phase === 'review' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-xs text-amber-700">Reviewing completed course — read-only</p>
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-4 py-8 pb-20">
        {phase === 'confidence-start' && renderConfidenceStart()}
        {phase === 'slides' && renderSlide()}
        {phase === 'guided-practice' && renderGuidedPractice()}
        {phase === 'open-practice' && renderOpenPractice()}
        {phase === 'debrief' && renderDebrief()}
        {phase === 'confidence-end' && renderConfidenceEnd()}
        {phase === 'completion' && renderCompletion()}
        {phase === 'review' && renderSlideReview()}
      </div>

      {/* Progress bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border px-4 py-3 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CourseFeedbackTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-light uppercase tracking-wide mb-1">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </label>
  )
}
