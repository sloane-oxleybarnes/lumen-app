import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Link from "next/link";

const skillModules = [
  {
    title: "Giving feedback",
    description:
      "Learn to deliver feedback that is direct, kind, and actually heard. Practice frameworks for difficult conversations with your manager, peers, and reports.",
    difficulty: "Beginner",
    sessions: 4,
    icon: "💬",
  },
  {
    title: "Navigating conflict",
    description:
      "Build the skills to stay grounded in tense moments, de-escalate without backing down, and repair relationships after ruptures.",
    difficulty: "Intermediate",
    sessions: 5,
    icon: "🤝",
  },
  {
    title: "Saying no well",
    description:
      "Set limits without guilt or over-explaining. Practice declining requests, pushing back on scope, and holding your ground.",
    difficulty: "Beginner",
    sessions: 3,
    icon: "🛑",
  },
  {
    title: "Asking for what you need",
    description:
      "Get comfortable making requests — for support, flexibility, recognition, or a promotion. Practice making asks that land.",
    difficulty: "Intermediate",
    sessions: 4,
    icon: "🙋",
  },
  {
    title: "Communicating under pressure",
    description:
      "When stakes are high and time is short, communication often breaks down first. Learn to stay clear when it matters most.",
    difficulty: "Advanced",
    sessions: 6,
    icon: "⚡",
  },
  {
    title: "Written communication",
    description:
      "Emails, Slack messages, and documents that get read, understood, and acted on. Less revision, more impact.",
    difficulty: "Beginner",
    sessions: 4,
    icon: "✍️",
  },
];

const difficultyColor: Record<string, string> = {
  Beginner: "bg-green-50 text-green-700 border border-green-200",
  Intermediate: "bg-amber-50 text-amber-700 border border-amber-200",
  Advanced: "bg-red-50 text-red-700 border border-red-200",
};

export default function SkillsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />

      <div className="pt-32 pb-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1
            className="text-4xl sm:text-5xl text-ink mb-4"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Skill modules
          </h1>
          <p className="text-ink-mid max-w-xl mx-auto text-lg">
            Structured coaching programs for the communication challenges that
            show up most in real work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skillModules.map((s) => (
            <div
              key={s.title}
              className="bg-white rounded-card border border-border p-7 flex flex-col"
            >
              <div className="text-3xl mb-4">{s.icon}</div>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`text-xs font-medium rounded-pill px-2.5 py-0.5 ${difficultyColor[s.difficulty]}`}
                >
                  {s.difficulty}
                </span>
                <span className="text-xs text-ink-light">
                  {s.sessions} sessions
                </span>
              </div>
              <h3
                className="text-lg text-ink mb-2"
                style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
              >
                {s.title}
              </h3>
              <p className="text-sm text-ink-mid leading-relaxed flex-1">
                {s.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 bg-primary-light border border-primary/20 rounded-card p-8 text-center">
          <h2
            className="text-2xl text-ink mb-3"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Available on Pro
          </h2>
          <p className="text-ink-mid mb-6">
            All skill modules are included in Pro. Join the beta for full
            access, free.
          </p>
          <Link
            href="/beta"
            className="bg-primary text-white rounded-pill px-8 py-3 text-sm font-medium hover:bg-primary-dark transition-colors inline-block"
          >
            Join the beta for full access
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
