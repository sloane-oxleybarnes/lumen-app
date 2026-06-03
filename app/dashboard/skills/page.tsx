import Link from 'next/link'
import { SKILL_MODULES } from '@/lib/skills'

const difficultyLabel: Record<string, string> = { low: 'Beginner', medium: 'Intermediate', high: 'Advanced' }
const difficultyColor: Record<string, string> = {
  low: 'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
}

export default function SkillsPage() {
  const maxDifficulty = (scenarios: { difficulty: string }[]) => {
    const order = ['low', 'medium', 'high']
    return scenarios.reduce((max, s) => order.indexOf(s.difficulty) > order.indexOf(max) ? s.difficulty : max, 'low')
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/dashboard" className="text-sm text-ink-mid hover:text-ink mb-8 inline-block">← Dashboard</Link>

      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        Skill modules
      </h1>
      <p className="text-ink-mid text-sm mb-10">
        Structured lessons for real-life conversations. Each module walks you through the skill, lets you practice with an AI, and gives you feedback.
      </p>

      <div className="grid gap-4">
        {SKILL_MODULES.map(module => {
          const diff = maxDifficulty(module.scenarios)
          return (
            <Link
              key={module.id}
              href={`/dashboard/skills/${module.id}`}
              className="group bg-white border border-border rounded-card p-5 hover:border-primary transition-colors flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-medium text-ink">{module.title}</h2>
                  <span className={`text-xs rounded-pill px-2 py-0.5 ${difficultyColor[diff]}`}>
                    {difficultyLabel[diff]}
                  </span>
                </div>
                <p className="text-sm text-ink-mid leading-relaxed">{module.description}</p>
              </div>
              <span className="text-ink-light group-hover:text-primary transition-colors text-lg mt-0.5 shrink-0">→</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
