import Link from 'next/link'
import { SKILL_MODULES, type SubCategory, type SkillModule } from '@/lib/skills'

const COURSE_OVERRIDES: Record<string, string> = {
  'ask-someone-out-text': '/dashboard/courses/ask-someone-out',
}

// Only modules with a COURSE_OVERRIDES entry are fully built
const LIVE_IDS = new Set(Object.keys(COURSE_OVERRIDES))

const SUBCATEGORY_SECTIONS: { sub: SubCategory; label: string }[] = [
  { sub: 'personal-dating', label: 'Personal — Dating' },
  { sub: 'personal-general', label: 'Personal — General Communication' },
  { sub: 'personal-family-friends', label: 'Personal — Family and Friends' },
  { sub: 'personal-self-advocacy', label: 'Personal — Self-Advocacy' },
  { sub: 'professional-colleague', label: 'Professional — Colleague' },
  { sub: 'professional-general', label: 'Professional — General Communication' },
  { sub: 'professional-manager-boss', label: 'Professional — Manager and Boss' },
]

function ModuleCard({ mod }: { mod: SkillModule }) {
  const isLive = LIVE_IDS.has(mod.id)
  const href = COURSE_OVERRIDES[mod.id] || `/dashboard/skills/${mod.id}`

  const inner = (
    <div className="relative bg-white border border-border rounded-card p-5 flex items-start justify-between gap-4 transition-colors group-hover:border-primary">
      {/* Coming soon overlay */}
      {!isLive && (
        <div className="absolute inset-0 rounded-card bg-white/70 flex items-center justify-end pr-5 z-10">
          <span className="text-xs text-ink-light font-medium">Coming soon</span>
        </div>
      )}
      <div className={`flex-1 min-w-0 ${!isLive ? 'opacity-40' : ''}`}>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h2 className="text-base font-medium text-ink">{mod.title}</h2>
          {isLive && (
            <span className="text-xs bg-primary-light text-primary rounded-pill px-2 py-0.5">Full course</span>
          )}
        </div>
        <p className="text-sm text-ink-mid leading-relaxed">{mod.description}</p>
        <p className="text-xs text-ink-light mt-1">{mod.estimatedMinutes} min</p>
      </div>
      <span className={`text-lg mt-0.5 shrink-0 transition-colors ${isLive ? 'text-ink-light group-hover:text-primary' : 'text-ink-light/30'}`}>→</span>
    </div>
  )

  if (!isLive) return <div className="cursor-default">{inner}</div>
  return <Link href={href} className="group block">{inner}</Link>
}

export default function SkillsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl text-ink mb-2" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>
        Skill modules
      </h1>
      <p className="text-ink-mid text-sm mb-10">
        Structured lessons for real conversations. Each module walks you through the skill, lets you practice with Beckett, and gives you feedback.
      </p>

      {SUBCATEGORY_SECTIONS.map(({ sub, label }) => {
        const modules = SKILL_MODULES.filter(m => m.subCategories.includes(sub))
        if (!modules.length) return null
        return (
          <section key={sub} className="mb-10">
            <h2 className="text-xs font-medium text-ink-light uppercase tracking-wide mb-4">{label}</h2>
            <div className="grid gap-4">
              {modules.map(mod => (
                <ModuleCard key={mod.id} mod={mod} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
