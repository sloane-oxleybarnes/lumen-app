import Link from 'next/link'
import { SKILL_MODULES, RECOMMENDED_IDS, type SubCategory, type SkillModule } from '@/lib/skills'

const COURSE_OVERRIDES: Record<string, string> = {
  'ask-someone-out-text': '/dashboard/courses/ask-someone-out',
}

const difficultyLabel: Record<string, string> = {
  foundations: 'Foundations',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}
const difficultyColor: Record<string, string> = {
  foundations: 'bg-green-50 text-green-700',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced: 'bg-red-50 text-red-700',
}

const SUBCATEGORY_SECTIONS: { sub: SubCategory; label: string }[] = [
  { sub: 'personal-dating', label: 'Personal — Dating' },
  { sub: 'personal-general', label: 'Personal — General Communication' },
  { sub: 'personal-family-friends', label: 'Personal — Family and Friends' },
  { sub: 'personal-self-advocacy', label: 'Personal — Self-Advocacy' },
  { sub: 'professional-colleague', label: 'Professional — Colleague' },
  { sub: 'professional-general', label: 'Professional — General Communication' },
  { sub: 'professional-manager-boss', label: 'Professional — Manager and Boss' },
]

function ModuleCard({ mod, recommended }: { mod: SkillModule; recommended?: boolean }) {
  const isInPerson = mod.format === 'in-person'

  return (
    <Link
      href={COURSE_OVERRIDES[mod.id] || `/dashboard/skills/${mod.id}`}
      className="group bg-white border border-border rounded-card p-5 hover:border-primary transition-colors flex items-start justify-between gap-4"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h2 className="text-base font-medium text-ink">{mod.title}</h2>
          {recommended && (
            <span className="text-xs bg-primary-light text-primary rounded-pill px-2 py-0.5">Start here</span>
          )}
          {isInPerson ? (
            <span className="text-xs bg-amber-50 text-amber-700 rounded-pill px-2 py-0.5">Video lessons coming</span>
          ) : (
            <span className={`text-xs rounded-pill px-2 py-0.5 ${difficultyColor[mod.difficulty]}`}>
              {difficultyLabel[mod.difficulty]}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-mid leading-relaxed">{mod.description}</p>
        <p className="text-xs text-ink-light mt-1">{mod.estimatedMinutes} min</p>
      </div>
      <span className="text-ink-light group-hover:text-primary transition-colors text-lg mt-0.5 shrink-0">→</span>
    </Link>
  )
}

export default function SkillsPage() {
  const recommended = SKILL_MODULES.filter(m => RECOMMENDED_IDS.includes(m.id))

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        Skill modules
      </h1>
      <p className="text-ink-mid text-sm mb-10">
        Structured lessons for real conversations. Each module walks you through the skill, lets you practice with Beckett, and gives you feedback.
      </p>

      <section className="mb-10">
        <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">Recommended for you</h2>
        <div className="grid gap-4">
          {recommended.map(mod => <ModuleCard key={mod.id} mod={mod} recommended />)}
        </div>
      </section>

      {SUBCATEGORY_SECTIONS.map(({ sub, label }) => {
        const modules = SKILL_MODULES.filter(m => m.subCategories.includes(sub))
        if (!modules.length) return null
        return (
          <section key={sub} className="mb-10">
            <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">{label}</h2>
            <div className="grid gap-4">
              {modules.map(mod => (
                <ModuleCard key={mod.id} mod={mod} recommended={RECOMMENDED_IDS.includes(mod.id)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
