const planBadgeColor: Record<string, string> = {
  beta: "bg-primary-light text-primary border border-primary/20",
  pro: "bg-primary text-white",
  team: "bg-amber-100 text-amber-700 border border-amber-200",
};

const activeFeatures = [
  { label: "Message decoder", icon: "🔍", status: "active" },
  { label: "Draft from context", icon: "✍️", status: "active" },
  { label: "Meeting guidance", icon: "🎥", status: "active" },
  { label: "Slack integration", icon: "💬", status: "active" },
  { label: "Practice mode", icon: "🎯", status: "active" },
  { label: "Skill modules", icon: "📚", status: "active" },
];

export default function ProDashboard({
  name,
  plan,
}: {
  name: string;
  plan: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-10">
        <h1
          className="text-3xl text-ink mb-1"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Welcome back, {name}.
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm text-ink-mid">Your plan:</span>
          <span
            className={`text-xs font-medium rounded-pill px-2.5 py-0.5 capitalize ${planBadgeColor[plan] || planBadgeColor.pro}`}
          >
            {plan}
          </span>
        </div>
      </div>

      {/* Stat stub cards */}
      <h2
        className="text-lg text-ink mb-4"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        This week
      </h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        {["Messages coached", "Meetings attended", "Skill sessions"].map((stat) => (
          <div
            key={stat}
            className="bg-white rounded-card border border-border p-5"
          >
            <p className="text-xs text-ink-light mb-2">{stat}</p>
            <p className="text-2xl font-semibold text-ink-light">—</p>
            <p className="text-xs text-ink-light mt-1">
              Your insights will appear here once you&apos;ve used Lumen for a
              few days.
            </p>
          </div>
        ))}
      </div>

      {/* Active features */}
      <h2
        className="text-lg text-ink mb-4"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        Your features
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeFeatures.map((f) => (
          <div
            key={f.label}
            className="bg-white rounded-card border border-border p-4 flex items-center gap-3"
          >
            <span className="text-xl">{f.icon}</span>
            <span className="text-sm text-ink-mid">{f.label}</span>
            <span className="ml-auto w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
