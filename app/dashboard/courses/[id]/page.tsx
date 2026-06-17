'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCourse } from '@/lib/courses'
import type {
  AccordionSlide, ReadThroughSlide, FlipCardsSlide,
  MatchingSlide, InteractiveReadSlide, DraftPracticeSlide,
  SideBySideSlide, SortingSlide, MultipleChoiceSlide, ChecklistSlide,
  VisualFormulaSlide, ReflectionChoiceSlide, GuidedBuilderSlide,
  MultiSelectQuizSlide,
} from '@/lib/courses'

type Phase = 'confidence-start' | 'slides' | 'guided-practice' | 'open-practice' | 'debrief' | 'confidence-end' | 'completion' | 'review'
type Message = { role: 'user' | 'assistant'; content: string; timestamp?: string }
type CourseApiError = Error & { status?: number; data?: { error?: string; limit?: number; remaining?: number } }
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
type ToolkitItem = {
  id: string
  course_id: string
  category: string
  label: string
  content: string
  created_at: string
  updated_at?: string
}

const PAIR_COLORS = [
  { bg: 'bg-sky-100', border: 'border-sky-400', text: 'text-sky-700' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700' },
]

const CLARITY_FORMULA_STEPS = ['What I understand', 'What is unclear', 'Specific question', 'Why it helps']

async function callAPI(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({})) as { error?: string; limit?: number; remaining?: number }
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Beckett could not complete that request.'
    const error = new Error(message) as CourseApiError
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}

export default function CoursePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
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
          if (searchParams.get('review') === 'toolkit') setPhase('review')
        }
      }
      loadToolkit()
    }
    checkAccess()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Phase + navigation ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('confidence-start')
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)

  // ── Confidence ───────────────────────────────────────────────────────────
  const [preConfidence, setPreConfidence] = useState<number | null>(null)
  const [postConfidence, setPostConfidence] = useState<number | null>(null)

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
  const [pendingRight, setPendingRight] = useState<number | null>(null)
  const [matchChecked, setMatchChecked] = useState(false)
  const [matchErrors, setMatchErrors] = useState<Set<number>>(new Set())
  const [matchAttemptCount, setMatchAttemptCount] = useState(0)
  const [matchRevealed, setMatchRevealed] = useState(false)

  // ── Interactive read / Draft practice ────────────────────────────────────
  const [draftInput, setDraftInput] = useState('')
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)

  // ── New workshop slides / toolkit ────────────────────────────────────────
  const [choiceSelections, setChoiceSelections] = useState<Record<string, string[]>>({})
  const [builderText, setBuilderText] = useState<Record<string, string>>({})
  const [builderChoices, setBuilderChoices] = useState<Record<string, string[]>>({})
  const [toolkitItems, setToolkitItems] = useState<ToolkitItem[]>([])
  const [toolkitSaving, setToolkitSaving] = useState(false)
  const [toolkitError, setToolkitError] = useState<string | null>(null)

  // ── Sorting ──────────────────────────────────────────────────────────────
  const [sortedItems, setSortedItems] = useState<Record<number, string>>({})
  const [sortingChecked, setSortingChecked] = useState(false)
  const [sortingErrors, setSortingErrors] = useState<Set<number>>(new Set())

  // ── Multiple choice ──────────────────────────────────────────────────────
  const [mcRound, setMcRound] = useState(0)
  const [mcSelected, setMcSelected] = useState<number | null>(null)
  const [mcShowFeedback, setMcShowFeedback] = useState(false)
  const [mcIsWrong, setMcIsWrong] = useState(false)

  // ── Multi-select quiz ────────────────────────────────────────────────────
  const [msRound, setMsRound] = useState(0)
  const [msSelections, setMsSelections] = useState<Record<number, number[]>>({})
  const [msOptionOrder, setMsOptionOrder] = useState<Record<number, number[]>>({})
  const [msChecked, setMsChecked] = useState(false)
  const [msHasError, setMsHasError] = useState(false)

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
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const [retryMessages, setRetryMessages] = useState<Message[] | null>(null)
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
        setPendingRight(null)
        setMatchChecked(false)
        setMatchErrors(new Set())
        setMatchAttemptCount(0)
        setMatchRevealed(false)
      }
      if (slide.type === 'multi-select-quiz') {
        const orders: Record<number, number[]> = {}
        slide.rounds.forEach((round, roundIdx) => {
          const order = round.options.map((_, i) => i)
          if (slide.shuffleOptions) {
            for (let i = order.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [order[i], order[j]] = [order[j], order[i]]
            }
          }
          orders[roundIdx] = order
        })
        setMsOptionOrder(orders)
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
    ? 100
    : Math.round((currentStep() / TOTAL_STEPS) * 100)

  // ── Slide state reset ──────────────────────────────────────────────────────
  function resetSlideState() {
    setExpandedSections(new Set())
    setCheckedSections(new Set())
    setFlippedCards(new Set())
    setMatchConns([])
    setPendingLeft(null)
    setPendingRight(null)
    setMatchChecked(false)
    setMatchErrors(new Set())
    setMatchAttemptCount(0)
    setMatchRevealed(false)
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
    setMsRound(0)
    setMsSelections({})
    setMsOptionOrder({})
    setMsChecked(false)
    setMsHasError(false)
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
      if (slide.suppressDoneScreen) {
        advanceSlide()
        return
      }
      setMcRound(slide.rounds.length)
    }
  }

  // ── Multi-select quiz ─────────────────────────────────────────────────────
  function toggleMSOption(optionIdx: number) {
    setMsSelections((current) => {
      const selected = new Set(current[msRound] || [])
      if (selected.has(optionIdx)) selected.delete(optionIdx)
      else selected.add(optionIdx)
      return { ...current, [msRound]: Array.from(selected) }
    })
    setMsChecked(false)
    setMsHasError(false)
  }

  function checkMSRound() {
    const slide = course.slides[currentSlideIndex] as MultiSelectQuizSlide
    const round = slide.rounds[msRound]
    const selected = new Set(msSelections[msRound] || [])
    const isCorrect = round.options.every((option, idx) => option.correct === selected.has(idx))
    setMsChecked(true)
    setMsHasError(!isCorrect)
    if (!isCorrect) {
      recordWrong({
        slideIndex: currentSlideIndex,
        itemIndex: msRound,
        slideTitle: slide.title,
        scenario: round.scenario,
        userAnswer: round.options.filter((_, idx) => selected.has(idx)).map((option) => option.text).join('; ') || 'none selected',
        correctAnswer: round.options.filter((option) => option.correct).map((option) => option.text).join('; '),
        explanation: round.explanation,
      })
    }
  }

  function advanceMSRound() {
    const slide = course.slides[currentSlideIndex] as MultiSelectQuizSlide
    if (msRound < slide.rounds.length - 1) {
      setMsRound((round) => round + 1)
      setMsChecked(false)
      setMsHasError(false)
    } else {
      if (slide.suppressDoneScreen) {
        advanceSlide()
        return
      }
      setMsRound(slide.rounds.length)
    }
  }

  // ── Matching ───────────────────────────────────────────────────────────────
  function clickLeft(leftIdx: number) {
    if (matchChecked) return
    if (pendingRight !== null) {
      setMatchConns(prev => {
        const filtered = prev.filter(c => c.left !== leftIdx && c.right !== pendingRight)
        return [...filtered, { left: leftIdx, right: pendingRight }]
      })
      setPendingRight(null)
      return
    }
    const existing = matchConns.find(c => c.left === leftIdx)
    if (existing) { setMatchConns(prev => prev.filter(c => c.left !== leftIdx)); return }
    if (pendingLeft === leftIdx) { setPendingLeft(null); return }
    setPendingLeft(leftIdx)
    setPendingRight(null)
  }

  function clickRight(rightVisualIdx: number) {
    if (matchChecked) return
    if (pendingLeft === null) {
      const existing = matchConns.find(c => c.right === rightVisualIdx)
      if (existing) {
        setMatchConns(prev => prev.filter(c => c.right !== rightVisualIdx))
        return
      }
      if (pendingRight === rightVisualIdx) setPendingRight(null)
      else setPendingRight(rightVisualIdx)
      return
    }
    setMatchConns(prev => {
      const filtered = prev.filter(c => c.left !== pendingLeft && c.right !== rightVisualIdx)
      return [...filtered, { left: pendingLeft, right: rightVisualIdx }]
    })
    setPendingLeft(null)
    setPendingRight(null)
  }

  function checkMatching() {
    const errors = new Set<number>()
    matchConns.forEach(c => {
      if (c.left !== shuffledRight[c.right]) errors.add(c.left)
    })
    const nextAttempts = errors.size > 0 ? matchAttemptCount + 1 : matchAttemptCount
    setMatchAttemptCount(nextAttempts)
    setMatchChecked(true)
    setMatchErrors(errors)
    if (errors.size > 0 && nextAttempts >= 3) {
      setMatchRevealed(true)
      setMatchErrors(new Set())
      setMatchConns(shuffledRight.map((_, visualIdx) => ({ left: shuffledRight[visualIdx], right: visualIdx })))
    }
  }

  function tryAgainMatching() {
    setMatchConns(prev => prev.filter(c => !matchErrors.has(c.left)))
    setMatchChecked(false)
    setMatchErrors(new Set())
    setPendingLeft(null)
    setPendingRight(null)
  }

  function getLeftColor(leftIdx: number): (typeof PAIR_COLORS)[0] | null {
    const slide = course.slides[currentSlideIndex]
    if (slide.type === 'matching' && slide.neutralChecked) return null
    const conn = matchConns.find(c => c.left === leftIdx)
    if (!conn) return null
    return PAIR_COLORS[leftIdx % PAIR_COLORS.length]
  }
  function getRightColor(rightVisualIdx: number): (typeof PAIR_COLORS)[0] | null {
    const slide = course.slides[currentSlideIndex]
    if (slide.type === 'matching' && slide.neutralChecked) return null
    const conn = matchConns.find(c => c.right === rightVisualIdx)
    if (!conn) return null
    if (matchErrors.has(conn.left)) return null
    return PAIR_COLORS[conn.left % PAIR_COLORS.length]
  }

  async function loadToolkit() {
    const res = await fetch('/api/course-toolkit')
    if (!res.ok) return
    const data = await res.json().catch(() => ({})) as { items?: ToolkitItem[] }
    setToolkitItems(data.items || [])
  }

  function fieldKey(slideTitle: string, key: string) {
    return `${slideTitle}:${key}`
  }

  function renderTemplate(template: string, values: Record<string, string>) {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key]?.trim() || `[${key}]`)
  }

  function valuesForBuilder(slide: GuidedBuilderSlide) {
    const values: Record<string, string> = {}
    slide.fields.forEach((field) => {
      const key = fieldKey(slide.title, field.key)
      const selected = builderChoices[key] || []
      const typed = builderText[key] || ''
      values[field.key] = field.multi ? [...selected, typed].filter(Boolean).join(', ') : typed || selected[0] || ''
    })
    return values
  }

  function outputsForBuilder(slide: GuidedBuilderSlide) {
    const values = valuesForBuilder(slide)
    return slide.outputs
      .map((output) => ({
        courseId: course.id,
        category: output.category,
        label: output.label,
        content: renderTemplate(output.template, values),
      }))
      .filter((item) => item.content && !item.content.includes('['))
  }

  async function saveBuilderOutputs(slide: GuidedBuilderSlide) {
    const items = outputsForBuilder(slide)
    if (items.length === 0) return
    setToolkitSaving(true)
    setToolkitError(null)
    const res = await fetch('/api/course-toolkit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    setToolkitSaving(false)
    const data = await res.json().catch(() => ({})) as { items?: ToolkitItem[]; error?: string }
    if (!res.ok) {
      setToolkitError(data.error || 'Could not save your phrases.')
      return
    }
    setToolkitItems((current) => [...(data.items || []), ...current])
  }

  // ── Draft feedback ─────────────────────────────────────────────────────────
  async function getDraftFeedback(ctx: string) {
    if (!draftInput.trim() || draftLoading) return
    setDraftLoading(true)
    try {
      const data = await callAPI({ action: 'draft_feedback', userMessage: draftInput, draftContext: ctx }) as { note?: string }
      if (data.note) setDraftFeedback(data.note)
    } catch (error) {
      setDraftFeedback(formatCourseApiError(error))
    } finally {
      setDraftLoading(false)
    }
  }

  // ── Guided practice ────────────────────────────────────────────────────────
  async function loadMiniConvo(wa: WrongAnswer) {
    setMiniConvoLoading(true)
    try {
      const data = await callAPI({
        action: 'mini_convo',
        wrongAnswer: wa.userAnswer, scenario: wa.scenario,
        explanation: wa.explanation, matchName: course.openPractice.matchName,
        practiceKind: course.openPractice.practiceKind,
      }) as { messages?: Message[] }
      if (data.messages?.length) setMiniConvo(data.messages)
    } finally {
      setMiniConvoLoading(false)
    }
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
  async function sendPracticeMessage(messagesToRetry?: Message[]) {
    if (practiceLoading || ghosted) return
    const next = messagesToRetry || (() => {
      if (!practiceInput.trim()) return null
      const userMsg: Message = { role: 'user', content: practiceInput.trim() }
      const baseMessages = practiceMessages.length === 0 ? (course.openPractice.starterMessages || []) : practiceMessages
      return [...baseMessages, userMsg]
    })()
    if (!next) return
    if (!messagesToRetry) {
      setPracticeMessages(next)
      setPracticeInput('')
    }
    setPracticeError(null)
    setRetryMessages(null)
    setPracticeLoading(true)
    try {
      const data = await callAPI({
        action: 'turn',
        system: course.openPractice.systemPrompt,
        messages: next,
        practiceKind: course.openPractice.practiceKind,
        courseId: course.id,
      }) as { text?: string }
      if (!data.text) throw new Error('Beckett did not return a response. Please try again.')
      const withAI = [...next, { role: 'assistant' as const, content: data.text }]
      setPracticeMessages(withAI)

      if (course.openPractice.practiceKind === 'dating' && withAI.length >= 4 && withAI.filter(m => m.role === 'user').length % 2 === 0) {
        callAPI({
          action: 'check_ghost',
          messages: withAI,
          matchName: course.openPractice.matchName,
          practiceKind: course.openPractice.practiceKind,
          courseId: course.id,
        }).then((raw) => {
          const d = raw as { ghost?: boolean; hardIntervention?: string | null }
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
    } catch (error) {
      setPracticeError(formatCourseApiError(error))
      setRetryMessages(next)
    } finally {
      setPracticeLoading(false)
    }
  }

  async function loadGhostAnalysis(msgs: Message[]) {
    const history = msgs.map(m => `[${m.role === 'user' ? 'You' : course.openPractice.matchName}]: ${m.content}`).join('\n')
    try {
      const data = await callAPI({
        action: 'ghost_analysis',
        conversationHistory: history,
        matchName: course.openPractice.matchName,
        practiceKind: course.openPractice.practiceKind,
        courseId: course.id,
      }) as { analysis?: string }
      if (data.analysis) setGhostAnalysis(data.analysis)
    } catch {
      setGhostAnalysis('Beckett could not analyze that moment, but you can still get your full debrief.')
    }
  }

  async function endPracticeAndDebrief() {
    if (practiceMessages.length < 2) return
    setDebriefLoading(true)
    const history = practiceMessages.map(m => `[${m.role === 'user' ? 'You' : course.openPractice.matchName}]: ${m.content}`).join('\n')
    try {
      const data = await callAPI({
        action: 'debrief',
        conversationHistory: history,
        matchName: course.openPractice.matchName,
        practiceKind: course.openPractice.practiceKind,
        courseId: course.id,
        matchDescription: course.openPractice.matchDescription,
      }) as DebriefData & { error?: string }
      if (!data.error) { setDebrief(data); setPhase('debrief') }
    } catch (error) {
      setPracticeError(formatCourseApiError(error))
    } finally {
      setDebriefLoading(false)
    }
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

  function FormulaProgress({ activeStep }: { activeStep?: number }) {
    if (!activeStep) return null
    return (
      <div className="mb-6 rounded-card border border-border bg-white p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-light">Clarity formula</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CLARITY_FORMULA_STEPS.map((step, idx) => {
            const isActive = activeStep === idx + 1
            const isPast = activeStep > idx + 1
            return (
              <div
                key={step}
                className={`rounded-card border px-3 py-2 text-xs leading-snug ${
                  isActive
                    ? 'border-primary bg-primary-light text-primary'
                    : isPast
                      ? 'border-primary/30 bg-primary/5 text-ink'
                      : 'border-border bg-bg text-ink-light'
                }`}
              >
                <span className="mb-1 block font-semibold">Step {idx + 1}</span>
                {step}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function HelperChecklist({ items }: { items?: string[] }) {
    if (!items?.length) return null
    return (
      <details className="mb-5 rounded-card border border-amber-200 bg-amber-50 p-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-amber-800">
          Clarity checklist
        </summary>
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-mid">
              <span className="text-amber-600">□</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </details>
    )
  }

  function CompactTips({ items }: { items?: string[] }) {
    if (!items?.length) return null
    return (
      <div className="relative group ml-auto w-fit">
        <button
          type="button"
          aria-label="Show clarity checklist"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-white"
        >
          ?
        </button>
        <div className="pointer-events-none absolute right-0 z-20 mt-2 hidden w-72 rounded-card border border-amber-200 bg-white p-3 text-left shadow-lg group-hover:block group-focus-within:block">
          <p className="mb-2 text-xs font-medium text-ink">Clarity Checklist</p>
          <p className="mb-2 text-xs text-ink-light">Use this to evaluate each response before selecting.</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-mid">
                <span className="text-amber-600">□</span>
                <span>{item}.</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  function formulaStepFromTitle(title: string) {
    const match = title.match(/^Step\s+(\d+)/i)
    if (!match) return undefined
    const step = Number(match[1])
    return step >= 1 && step <= 4 ? step : undefined
  }

  function formatCourseApiError(error: unknown) {
    const apiError = error as CourseApiError
    if (apiError.status === 401) return 'Please log back in to keep practicing with Beckett.'
    if (apiError.status === 403) return apiError.message || 'This course needs beta access.'
    if (apiError.status === 429) return apiError.message || 'You reached today\'s course practice limit.'
    if (apiError.status && apiError.status >= 500) {
      return apiError.message
        ? `Beckett could not reply yet: ${apiError.message}`
        : 'Beckett had trouble responding. Your message is still here, and you can try again.'
    }
    return apiError.message || 'Beckett had trouble responding. Please try again.'
  }

  function SideBySideComparison({ comparison }: { comparison: NonNullable<InteractiveReadSlide['comparison']> }) {
    return (
      <div className="mt-8 pt-8 border-t border-border">
        <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-3">Spot the difference</p>
        <p className="text-sm text-ink-mid mb-4 leading-relaxed">{comparison.scenario}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-3">{comparison.bad.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{comparison.bad.message}</p>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{comparison.bad.note}</p>
          </div>
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">{comparison.good.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{comparison.good.message}</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">{comparison.good.note}</p>
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
              onClick={() => setPhase('review')}
              className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5 hover:bg-primary-light transition-colors"
            >
              Review skills →
            </button>
          </div>
        )}
        <p className="text-xs text-ink-light uppercase tracking-wide mb-3">Before you start</p>
        <h1 className="text-4xl text-ink mb-4 leading-tight" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          {course.title}
        </h1>
        <p className="text-base text-ink-mid mb-4 leading-relaxed">{course.description}</p>
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
    const courseToolkitItems = toolkitItems.filter((item) => item.course_id === course.id)
    const usesToolkit = course.savesToToolkit !== false
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
            {usesToolkit ? <ToolkitSummary items={courseToolkitItems} /> : <CourseRecap />}
            <button
              onClick={() => { saveCompletion(); setPhase('completion') }}
              className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
            >
              Finish course →
            </button>
          </div>
        )}
      </div>
    )
  }

  function CourseRecap() {
    const summary = course.reviewSummary
    if (!summary) {
      return (
        <div className="mb-6 rounded-card border border-border bg-white p-5">
          <p className="text-sm font-medium text-ink mb-1">What you practiced</p>
          <p className="text-sm text-ink-mid leading-relaxed">{course.reflectiveQuestion}</p>
        </div>
      )
    }

    return (
      <div className="mb-6 rounded-card border border-primary/20 bg-primary/5 p-5">
        <p className="text-sm font-medium text-ink mb-1">{summary.title}</p>
        <p className="text-xs text-ink-mid mb-4 leading-relaxed">{summary.description}</p>
        {summary.formulas && (
          <div className="grid gap-2 mb-4">
            {summary.formulas.map((item, idx) => (
              <div key={item.label} className="rounded-card border border-border bg-white p-3">
                <p className="text-xs font-medium text-primary mb-1">Step {idx + 1}: {item.label}</p>
                <p className="text-sm text-ink leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        )}
        {summary.checklist && (
          <div className="rounded-card border border-border bg-white p-3">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Final checklist</p>
            <ul className="space-y-1.5">
              {summary.checklist.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-ink-mid">
                  <span className="text-primary">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function ToolkitSummary({ items }: { items: ToolkitItem[] }) {
    if (items.length === 0) {
      return (
        <div className="mb-6 rounded-card border border-border bg-white p-5">
          <p className="text-sm font-medium text-ink mb-1">Communication toolkit</p>
          <p className="text-sm text-ink-mid leading-relaxed">You did not save any phrases in this run. You can still review the course formulas after finishing.</p>
        </div>
      )
    }

    return (
      <div className="mb-6 rounded-card border border-primary/20 bg-primary/5 p-5">
        <p className="text-sm font-medium text-ink mb-1">Saved to your Communication toolkit</p>
        <p className="text-xs text-ink-mid mb-4">These are the phrases and questions you built in this course.</p>
        <div className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-card border border-border bg-white p-3">
              <p className="text-xs font-medium text-primary mb-1">{item.label}</p>
              <p className="text-sm text-ink leading-relaxed">{item.content}</p>
            </div>
          ))}
        </div>
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
                  onClick={() => {
                    setExpandedSections(prev => { const s = new Set(prev); if (isOpen) s.delete(i); else s.add(i); return s })
                    setCheckedSections(prev => new Set(prev).add(i))
                  }}
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!allChecked && (
          <p className="text-xs text-ink-light text-center mb-2">Open each required coaching section to continue.</p>
        )}
        <NextButton disabled={!allChecked} />
      </div>
    )
  }

  function renderReadThrough(slide: ReadThroughSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
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
    const allCorrect = (matchChecked && matchErrors.size === 0 && allConnected) || matchRevealed
    const hasErrors = matchChecked && matchErrors.size > 0

    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <p className="text-xs text-ink-light mb-5">{slide.instruction}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Left column */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide text-center">{slide.leftLabel || 'People'}</p>
            {slide.pairs.map((pair, i) => {
              const color = getLeftColor(i)
              const isPending = pendingLeft === i
              const hasError = matchErrors.has(i)
              const isCorrectChecked = (matchChecked || matchRevealed) && matchConns.some(c => c.left === i && c.left === shuffledRight[c.right])
              return (
                <button
                  key={i}
                  onClick={() => clickLeft(i)}
                  className={`w-full text-left rounded-xl p-3 border-2 transition-all text-sm ${
                    hasError ? 'border-red-400 bg-red-50' :
                    isCorrectChecked && slide.neutralChecked ? 'border-green-300 bg-green-50' :
                    isPending ? 'border-primary bg-primary/5' :
                    color ? `${color.bg} ${color.border}` :
                    'border-border bg-white hover:border-primary'
                  }`}
                >
                  {!slide.hideCardNames && <p className="font-medium text-ink text-xs mb-1">{pair.left.name}</p>}
                  <p className="text-ink-mid" style={{ fontSize: '11px', lineHeight: '1.4' }}>{pair.left.description}</p>
                  {isCorrectChecked && slide.neutralChecked && <span className="mt-2 inline-flex text-xs text-green-700">✓ Correct</span>}
                  {color && !hasError && !slide.neutralChecked && (
                    <span className={`inline-flex mt-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] text-white ${color.bg.replace('100', '400')}`}>
                      {matchChecked || matchRevealed ? '✓' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right column (shuffled) */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wide text-center">{slide.rightLabel || 'Matches'}</p>
            {shuffledRight.map((pairIdx, visualIdx) => {
              const pair = slide.pairs[pairIdx]
              const color = getRightColor(visualIdx)
              const conn = matchConns.find(c => c.right === visualIdx)
              const isPending = pendingRight === visualIdx
              const hasError = conn ? matchErrors.has(conn.left) : false
              const wrongLeftPair = hasError && conn ? slide.pairs[conn.left] : null
              const isCorrectChecked = (matchChecked || matchRevealed) && conn && conn.left === pairIdx
              return (
                <div key={visualIdx} className="space-y-1">
                  <button
                    onClick={() => clickRight(visualIdx)}
                    className={`w-full text-left rounded-xl p-3 border-2 transition-all text-sm ${
                      hasError ? 'border-red-400 bg-red-50' :
                      isCorrectChecked && slide.neutralChecked ? 'border-green-300 bg-green-50' :
                      isPending ? 'border-primary bg-primary/5' :
                      color ? `${color.bg} ${color.border}` :
                      'border-border bg-white hover:border-primary'
                    }`}
                  >
                    {!slide.hideCardNames && <p className="font-medium text-ink text-xs mb-1">{pair.right.name}</p>}
                    <p className="text-ink-mid" style={{ fontSize: '11px', lineHeight: '1.4' }}>{pair.right.description}</p>
                    {isCorrectChecked && slide.neutralChecked && <span className="mt-2 inline-flex text-xs text-green-700">✓ Correct</span>}
                    {color && !hasError && !slide.neutralChecked && (
                      <span className={`inline-flex mt-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] text-white ${color.bg.replace('100', '400')}`}>
                        {matchChecked || matchRevealed ? '✓' : ''}
                      </span>
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

        {pendingLeft !== null && !matchChecked && !slide.hideCardNames && (
          <p className="text-xs text-primary text-center mb-3">
            {slide.pairs[pendingLeft].left.name} selected — now tap their match →
          </p>
        )}

        <div className="space-y-2 mb-2">
          {matchRevealed && (
            <div className="rounded-card border border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-xs text-primary">Beckett showed the correct matches so you can keep moving.</p>
            </div>
          )}
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
        <SlideTitle title={slide.title} description={slide.description} />
        <p className="text-sm text-ink-mid mb-6 leading-relaxed">{slide.scenario}</p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-3">{slide.bad.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{slide.bad.message}</p>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{slide.bad.note}</p>
          </div>
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">{slide.good.label}</p>
            <div className="bg-white rounded-xl px-4 py-3 mb-3">
              <p className="text-sm text-ink leading-relaxed">{slide.good.message}</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">{slide.good.note}</p>
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
        <FormulaProgress activeStep={formulaStepFromTitle(slide.title)} />
        <SlideTitle title={slide.title} description={slide.description} />
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
                  sortingChecked && assigned === item.correct ? 'border-green-300 bg-green-50' :
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
          <FormulaProgress activeStep={formulaStepFromTitle(slide.title)} />
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
        <FormulaProgress activeStep={formulaStepFromTitle(slide.title)} />
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <SlideTitle title={slide.title} description={slide.description} />
          </div>
          {slide.compactHelper && <CompactTips items={slide.helperChecklist} />}
        </div>
        {!slide.compactHelper && <HelperChecklist items={slide.helperChecklist} />}
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
        <div className="mt-5">
          <div className="mb-2 flex gap-1">
            {slide.rounds.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i < mcRound ? 'bg-primary' : i === mcRound ? 'bg-primary/40' : 'bg-gray-200'}`} />
            ))}
          </div>
          <p className="text-center text-xs text-ink-light">Round {mcRound + 1} of {slide.rounds.length}</p>
        </div>
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

  function renderMultiSelectQuiz(slide: MultiSelectQuizSlide) {
    const allDone = msRound >= slide.rounds.length
    if (allDone) {
      return (
        <div>
          <BackButton idx={currentSlideIndex} />
          <FormulaProgress activeStep={slide.formulaStep} />
          <SlideTitle title={slide.title} description={slide.description} />
          <div className="text-center py-12">
            <p className="text-3xl mb-3">✓</p>
            <p className="text-ink font-medium">All done</p>
          </div>
          <NextButton label="Continue →" />
        </div>
      )
    }

    const round = slide.rounds[msRound]
    const selected = new Set(msSelections[msRound] || [])
    const canCheck = selected.size > 0 && !msChecked
    const optionOrder = msOptionOrder[msRound] || round.options.map((_, idx) => idx)
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <FormulaProgress activeStep={slide.formulaStep} />
        <SlideTitle title={slide.title} description={slide.description} />
        <div className="bg-bg border border-border rounded-card p-4 mb-5">
          <p className="text-sm text-ink leading-relaxed mb-3">{round.scenario}</p>
          <p className="text-xs font-medium text-ink-light uppercase tracking-wide">{round.question}</p>
        </div>
        <div className="space-y-2 mb-5">
          {optionOrder.map((idx) => {
            const option = round.options[idx]
            const isSelected = selected.has(idx)
            const showCorrect = msChecked && option.correct
            const showWrong = msChecked && isSelected && !option.correct
            const missed = msChecked && !isSelected && option.correct
            return (
              <button
                key={option.text}
                type="button"
                onClick={() => !msChecked && toggleMSOption(idx)}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors ${
                  showWrong ? 'border-red-300 bg-red-50 text-ink' :
                  showCorrect ? 'border-green-300 bg-green-50 text-ink' :
                  missed ? 'border-primary/50 bg-primary/5 text-ink' :
                  isSelected ? 'border-primary bg-primary-light text-primary' :
                  'border-border bg-white text-ink hover:border-primary'
                }`}
              >
                <span className="mr-2">{msChecked ? (option.correct ? '✓' : isSelected ? '✗' : '□') : isSelected ? '✓' : '□'}</span>
                {option.text}
              </button>
            )
          })}
        </div>
        {msChecked && (
          <div className={`rounded-card border p-4 mb-4 ${msHasError ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            <p className={`text-sm leading-relaxed ${msHasError ? 'text-amber-800' : 'text-green-800'}`}>
              {round.explanation}
            </p>
          </div>
        )}
        <div className="mb-5">
          <div className="mb-2 flex gap-1">
            {slide.rounds.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i < msRound ? 'bg-primary' : i === msRound ? 'bg-primary/40' : 'bg-gray-200'}`} />
            ))}
          </div>
          <p className="text-center text-xs text-ink-light">Round {msRound + 1} of {slide.rounds.length}</p>
        </div>
        {!msChecked ? (
          <button
            onClick={checkMSRound}
            disabled={!canCheck}
            className="w-full border border-primary text-primary rounded-pill py-2.5 text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-40"
          >
            Check answers
          </button>
        ) : (
          <button
            onClick={advanceMSRound}
            className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            {msRound < slide.rounds.length - 1 ? 'Next round →' : 'Done →'}
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

  function renderVisualFormula(slide: VisualFormulaSlide) {
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <FormulaProgress activeStep={slide.activeStep} />
        <SlideTitle title={slide.title} description={slide.description} />
        <div className="grid gap-3 mb-6">
          {slide.steps.map((step, i) => (
            <div key={step.label} className="bg-white border border-border rounded-xl p-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink mb-1">{step.label}</p>
                  <p className="text-sm text-ink-mid leading-relaxed">{step.text}</p>
                  {step.example && (
                    <p className="mt-2 rounded-card border border-border bg-bg px-3 py-2 text-xs italic text-ink-mid">{step.example}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <NextButton />
      </div>
    )
  }

  function renderReflectionChoice(slide: ReflectionChoiceSlide) {
    const selected = choiceSelections[slide.title] || []
    const canContinue = selected.length > 0
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <p className="text-sm text-ink-mid mb-4">{slide.prompt}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {slide.options.map((option) => {
            const isSelected = selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setChoiceSelections((current) => {
                    const next = new Set(current[slide.title] || [])
                    if (isSelected) next.delete(option)
                    else {
                      if (!slide.multi) next.clear()
                      next.add(option)
                    }
                    return { ...current, [slide.title]: Array.from(next) }
                  })
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  isSelected ? 'border-primary bg-primary-light text-primary' : 'border-border bg-white text-ink hover:border-primary'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>
        <NextButton disabled={!canContinue} />
      </div>
    )
  }

  function renderGuidedBuilder(slide: GuidedBuilderSlide) {
    const values = valuesForBuilder(slide)
    const outputs = outputsForBuilder(slide)
    const canSave = outputs.length > 0
    return (
      <div>
        <BackButton idx={currentSlideIndex} />
        <SlideTitle title={slide.title} description={slide.description} />
        <div className="space-y-5 mb-6">
          {slide.fields.map((field) => {
            const key = fieldKey(slide.title, field.key)
            const selected = builderChoices[key] || []
            return (
              <div key={field.key} className="bg-white border border-border rounded-card p-4">
                <label className="block text-sm font-medium text-ink mb-2">{field.label}</label>
                {field.options && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {field.options.map((option) => {
                      const isSelected = selected.includes(option)
                      return (
                        <button
                          type="button"
                          key={option}
                          onClick={() => {
                            setBuilderChoices((current) => {
                              const next = new Set(current[key] || [])
                              if (isSelected) next.delete(option)
                              else {
                                if (!field.multi) next.clear()
                                next.add(option)
                              }
                              return { ...current, [key]: Array.from(next) }
                            })
                          }}
                          className={`rounded-pill border px-3 py-1.5 text-xs transition-colors ${
                            isSelected ? 'border-primary bg-primary-light text-primary' : 'border-border bg-bg text-ink-mid hover:border-primary'
                          }`}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                )}
                <input
                  value={builderText[key] || ''}
                  onChange={(e) => setBuilderText((current) => ({ ...current, [key]: e.target.value }))}
                  placeholder={field.placeholder || 'Type your own...'}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )
          })}
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-card p-4 mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary mb-3">Your saved phrases</p>
          {slide.outputs.map((output) => (
            <div key={output.label} className="bg-white border border-border rounded-card p-3 mb-2 last:mb-0">
              <p className="text-xs font-medium text-ink-light mb-1">{output.label}</p>
              <p className="text-sm text-ink leading-relaxed">{renderTemplate(output.template, values)}</p>
            </div>
          ))}
        </div>
        {toolkitError && <p className="text-xs text-red-600 mb-3">{toolkitError}</p>}
        <button
          onClick={async () => { await saveBuilderOutputs(slide); advanceSlide() }}
          disabled={!canSave || toolkitSaving}
          className="mt-4 w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          {toolkitSaving ? 'Saving...' : slide.saveLabel || 'Save to toolkit and continue →'}
        </button>
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
      case 'multi-select-quiz': return renderMultiSelectQuiz(slide)
      case 'checklist': return renderChecklist(slide)
      case 'visual-formula': return renderVisualFormula(slide)
      case 'reflection-choice': return renderReflectionChoice(slide)
      case 'guided-builder': return renderGuidedBuilder(slide)
    }
  }

  // ── Review mode (read-only slide browser) ─────────────────────────────────
  function renderSlideReview() {
    const courseToolkitItems = toolkitItems.filter((item) => item.course_id === course.id)
    const usesToolkit = course.savesToToolkit !== false
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
          Review skills
        </h1>
        <p className="text-sm text-ink-mid mb-6 leading-relaxed">
          {usesToolkit ? 'A quick recap of what you built and the core ideas from this course.' : 'A quick recap of the formula and checklist from this course.'}
        </p>
        {usesToolkit ? <ToolkitSummary items={courseToolkitItems} /> : <CourseRecap />}
        <div className="rounded-card border border-border bg-white p-5 mb-6">
          <p className="text-sm font-medium text-ink mb-3">Core course reminders</p>
          <div className="space-y-2">
            {course.slides
              .filter((slide) => slide.type === 'visual-formula' || slide.type === 'checklist')
              .slice(0, 3)
              .map((slide) => (
                <div key={slide.title} className="rounded-card bg-bg px-3 py-2">
                  <p className="text-sm text-ink">{slide.title}</p>
                </div>
              ))}
          </div>
        </div>
        <div className="flex gap-3">
          {usesToolkit && (
            <a href="/dashboard/about" className="flex-1 border border-primary text-primary rounded-pill py-3 text-sm font-medium text-center hover:bg-primary-light transition-colors">
              Open toolkit
            </a>
          )}
          <button
            onClick={() => setPhase('confidence-start')}
            className="flex-1 bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Done
          </button>
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
    const { matchName, channel = 'chat' } = course.openPractice
    const canEnd = practiceMessages.length >= 2 && !debriefLoading
    const starterMessages = course.openPractice.starterMessages || []
    const displayedMessages = practiceMessages.length === 0 ? starterMessages : practiceMessages

    return (
      <div className="max-w-lg mx-auto flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="flex items-center gap-3 pb-3 mb-3 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm shrink-0">
            {matchName[0]}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{matchName}</p>
            <p className="text-xs text-ink-light">{course.openPractice.subtitle || course.openPractice.matchDescription}</p>
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
          {course.openPractice.contextPanel && practiceMessages.length === 0 && (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-4 mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800 mb-2">{course.openPractice.contextPanel.title}</p>
              <ul className="space-y-1.5">
                {course.openPractice.contextPanel.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-ink-mid leading-relaxed">
                    <span className="text-amber-600">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {practiceMessages.length === 0 && starterMessages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">Your goal</p>
              <p className="text-sm text-ink-mid">
                {course.openPractice.goal}
              </p>
            </div>
          )}
          {starterMessages.length > 0 && practiceMessages.length === 0 && (
            <div className="rounded-card border border-border bg-bg p-3 mb-3">
              <p className="text-xs font-medium text-ink-light uppercase tracking-wide mb-1">Your goal</p>
              <p className="text-sm text-ink-mid leading-relaxed">{course.openPractice.goal}</p>
            </div>
          )}
          {displayedMessages.map((m, i) => {
            const isLast = i === displayedMessages.length - 1
            return (
              <div key={i}>
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? channel === 'slack' ? 'bg-primary text-white rounded-br-sm' : 'bg-blue-500 text-white rounded-br-sm'
                      : channel === 'slack' ? 'bg-white border border-border text-ink rounded-bl-sm' : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                  }`}>
                    {m.timestamp && <span className="mb-1 block text-[10px] opacity-60">{m.timestamp}</span>}
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
                {matchName} stopped responding. This is practice, not a judgment.
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
          {practiceError && (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-800 mb-1">Reply did not come through</p>
                <p className="text-sm text-ink-mid leading-relaxed">{practiceError}</p>
              </div>
              {retryMessages && (
                <button
                  type="button"
                  onClick={() => sendPracticeMessage(retryMessages)}
                  disabled={practiceLoading}
                  className="rounded-pill border border-amber-300 bg-white px-4 py-2 text-xs font-medium text-amber-800 hover:border-amber-500 disabled:opacity-50"
                >
                  Try again
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!ghosted && !hardIntervention && (
          <div className="shrink-0 space-y-2">
            {course.openPractice.starterOptions && practiceMessages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {course.openPractice.starterOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPracticeInput(option)}
                    className="rounded-pill border border-border bg-white px-3 py-1.5 text-xs text-ink-mid hover:border-primary hover:text-ink"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
            <input
              type="text" value={practiceInput}
              onChange={e => setPracticeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendPracticeMessage() }}
              placeholder={`Message ${matchName}…`}
              disabled={practiceLoading}
              className="flex-1 border border-border rounded-pill px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => sendPracticeMessage()}
              disabled={practiceLoading || !practiceInput.trim()}
              className="bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0"
            >
              ↑
            </button>
            </div>
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
              setPracticeError(null)
              setRetryMessages(null)
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
              <p className="text-sm text-ink-mid mb-2 leading-relaxed">A quick note helps Beckett learn which coaching moments are actually useful.</p>
              <p className="mb-4 text-xs leading-relaxed text-ink-light">
                Course feedback is saved for beta review and may include the notes you type here.
              </p>

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
