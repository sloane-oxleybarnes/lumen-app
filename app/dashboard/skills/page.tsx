'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type SkillCard = {
  id: string
  title: string
  description: string
  href: string
  status: 'live' | 'planned'
  level: 'Foundational'
  estimatedMinutes: number
  courseId?: string
  illustration: 'date' | 'colleague' | 'no'
}

const SECTIONS: { label: string; description: string; cards: SkillCard[] }[] = [
  {
    label: 'Professional - Colleague',
    description: 'Foundational workplace courses we are building for beta.',
    cards: [
      {
        id: 'introducing-new-colleague',
        title: 'Introducing yourself to a new colleague',
        description: 'Start a new working relationship clearly without scripting yourself into stiffness.',
        href: '/dashboard/courses/introducing-new-colleague',
        status: 'live',
        level: 'Foundational',
        estimatedMinutes: 35,
        courseId: 'introducing-new-colleague',
        illustration: 'colleague',
      },
      {
        id: 'asking-for-clarity',
        title: 'Asking for clarity without feeling uncomfortable',
        description: 'Ask specific follow-up questions at work without over-apologizing or pretending you understand.',
        href: '/dashboard/courses/asking-for-clarity',
        status: 'live',
        level: 'Foundational',
        estimatedMinutes: 35,
        courseId: 'asking-for-clarity',
        illustration: 'colleague',
      },
    ],
  },
  {
    label: 'Personal Preview',
    description: 'A small look at where Beckett will go beyond work later.',
    cards: [
      {
        id: 'ask-someone-out-text',
        title: 'Asking someone out on a dating app',
        description: 'Move from chatting to a clear, low-pressure ask with Beckett coaching you through the wording and practice.',
        href: '/dashboard/courses/ask-someone-out',
        status: 'live',
        level: 'Foundational',
        estimatedMinutes: 30,
        courseId: 'ask-someone-out',
        illustration: 'date',
      },
    ],
  },
]

function LineIllustration({ type }: { type: SkillCard['illustration'] }) {
  return (
    <div className="h-24 w-28 shrink-0 rounded-sm border border-border bg-bg/80 p-4" aria-hidden="true">
      {type === 'date' && (
        <div className="relative h-full">
          <div className="absolute left-0 top-1 h-7 w-16 rounded-full border border-primary/60" />
          <div className="absolute right-0 top-8 h-7 w-16 rounded-full border border-ink-light/50" />
          <div className="absolute bottom-0 left-5 h-5 w-5 rounded-full border border-primary" />
          <div className="absolute bottom-0 left-12 h-5 w-5 rounded-full border border-primary" />
        </div>
      )}
      {type === 'colleague' && (
        <div className="relative h-full">
          <div className="absolute left-2 top-3 h-8 w-8 rounded-full border border-primary" />
          <div className="absolute right-2 top-3 h-8 w-8 rounded-full border border-primary" />
          <div className="absolute left-0 bottom-4 h-px w-full bg-border" />
          <div className="absolute left-5 bottom-1 h-5 w-12 rounded-t-full border border-ink-light/50" />
        </div>
      )}
      {type === 'no' && (
        <div className="relative h-full">
          <div className="absolute left-1 top-2 h-14 w-20 rounded-sm border border-primary/70" />
          <div className="absolute left-4 top-6 h-px w-14 bg-primary/70" />
          <div className="absolute left-4 top-9 h-px w-10 bg-primary/70" />
          <div className="absolute bottom-1 right-1 h-8 w-8 rounded-full border border-ink-light/60" />
          <div className="absolute bottom-5 right-3 h-px w-4 rotate-45 bg-ink-light/70" />
        </div>
      )}
    </div>
  )
}

function SkillModuleCard({ card, completedCourseIds }: { card: SkillCard; completedCourseIds: Set<string> }) {
  const isCompleted = card.courseId ? completedCourseIds.has(card.courseId) : false
  const isLive = card.status === 'live'

  const targetHref = isCompleted ? `${card.href}?review=toolkit` : card.href
  const inner = (
    <div className={`relative flex gap-5 rounded-card border p-5 transition-colors ${
      isCompleted
        ? 'border-border bg-gray-50 opacity-80 group-hover:opacity-100'
        : 'border-border bg-white group-hover:border-primary'
    }`}>
      {isCompleted && (
        <div className="absolute inset-0 rounded-card bg-white/30 pointer-events-none" />
      )}
      <LineIllustration type={card.illustration} />
      <div className="min-w-0 flex-1 relative">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium text-ink">{card.title}</h2>
          {isLive ? (
            <span className="rounded-pill bg-primary-light px-2 py-0.5 text-xs text-primary">{card.level}</span>
          ) : (
            <span className="rounded-pill bg-bg px-2 py-0.5 text-xs text-ink-light">Coming soon</span>
          )}
          {isCompleted && (
            <span className="rounded-pill border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">Course completed</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-ink-mid">{card.description}</p>
        <p className="mt-3 text-xs text-ink-light">{isCompleted ? 'Review skills' : `${card.estimatedMinutes} min`}</p>
      </div>
      <span className={`mt-1 text-lg ${isLive ? 'text-ink-light group-hover:text-primary' : 'text-ink-light/40'}`}>→</span>
    </div>
  )

  if (!isLive) return <div className="cursor-default opacity-85">{inner}</div>
  return <Link href={targetHref} className="group block">{inner}</Link>
}

export default function SkillsPage() {
  const [completedCourseIds, setCompletedCourseIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    async function loadCompletions() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('course_completions').select('course_id').eq('user_id', user.id)
      if (data) setCompletedCourseIds(new Set(data.map((r: { course_id: string }) => r.course_id)))
    }
    loadCompletions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-5xl">
      <h1 className="mb-2 text-3xl text-ink" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        Skills and courses
      </h1>
      <p className="mb-10 text-sm text-ink-mid">
        Beckett coaches you through real situations, then gives you space to practice before you try it live.
      </p>

      {SECTIONS.map(section => (
        <section key={section.label} className="mb-10">
          <div className="mb-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-light">{section.label}</h2>
          </div>
          <div className="grid gap-4">
            {section.cards.slice(0, 2).map(card => (
              <SkillModuleCard key={card.id} card={card} completedCourseIds={completedCourseIds} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
