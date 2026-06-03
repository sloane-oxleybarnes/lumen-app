import Link from 'next/link'
import { SKILL_MODULES } from '@/lib/skills'

const difficultyLabel: Record<string, string> = { low: 'Beginner', medium: 'Intermediate', high: 'Advanced' }
const difficultyColor: Record<string, string> = {
  low: 'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
}

const RECOMMENDED_IDS = ['navigate-small-talk', 'set-work-boundary']

function maxDifficulty(scenarios: { difficulty: string }[]) {
  const order = ['low', 'medium', 'high']
  return scenarios.reduce((max, s) => order.indexOf(s.difficulty) > order.indexOf(max) ? s.difficulty : max, 'low')
}

function ModuleCard({ mod, recommended }: { mod: typeof SKILL_MODULES[number]; recommended?: boolean }) {
  const diff = maxDifficulty(mod.scenarios)
  return (
    <Link
      href={`/dashboard/skills/${mod.id}`}
      className="group bg-white border border-border rounded-card p-5 hover:border-primary transition-colors flex items-start justify-between gap-4"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h2 className="text-base font-medium text-ink">{mod.title}</h2>
          {recommended && (
            <span className="text-xs bg-primary-light text-primary rounded-pill px-2 py-0.5">
              Start here
            </span>
          )}
          <span className={`text-xs rounded-pill px-2 py-0.5 ${difficultyColor[diff]}`}>
            {difficultyLabel[diff]}
          </span>
        </div>
        <p className="text-sm text-ink-mid leading-relaxed">{mod.description}</p>
      </div>
      <span className="text-ink-light group-hover:text-primary transition-colors text-lg mt-0.5 shrink-0">→</span>
    </Link>
  )
}

export default function SkillsPage() {
  const recommended = SKILL_MODULES.filter(m => RECOMMENDED_IDS.includes(m.id))
  const professional = SKILL_MODULES.filter(m => m.category === 'professional')
  const personal = SKILL_MODULES.filter(m => m.category === 'personal')

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        Skill modules
      </h1>
      <p className="text-ink-mid text-sm mb-10">
        Structured lessons for real conversations. Each module walks you through the skill, lets you practice with an AI, and gives you feedback.
      </p>

      {/* Recommended */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">
          Recommended for you
        </h2>
        <div className="grid gap-4">
          {recommended.map(mod => (
            <ModuleCard key={mod.id} mod={mod} recommended />
          ))}
        </div>
      </section>

      {/* Professional */}
      <section className="mb-10">
        <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">
          Professional
        </h2>
        <div className="grid gap-4">
          {professional.map(mod => (
            <ModuleCard key={mod.id} mod={mod} recommended={RECOMMENDED_IDS.includes(mod.id)} />
          ))}
        </div>
      </section>

      {/* Personal */}
      <section>
        <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">
          Personal
        </h2>
        <div className="grid gap-4">
          {personal.map(mod => (
            <ModuleCard key={mod.id} mod={mod} recommended={RECOMMENDED_IDS.includes(mod.id)} />
          ))}
        </div>
      </section>
    </div>
  )
}
