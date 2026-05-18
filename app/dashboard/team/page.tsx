import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  team_opt_in: boolean;
  created_at: string;
};

export default async function TeamPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (profile?.plan !== "team" || profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: team } = profile?.team_id
    ? await supabase.from("teams").select("*").eq("id", profile.team_id).single()
    : { data: null };

  const { data: members } = profile?.team_id
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, team_opt_in, created_at")
        .eq("team_id", profile.team_id)
    : { data: [] };

  return (
    <div className="max-w-2xl">
      <h1
        className="text-3xl text-ink mb-8"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        Team
      </h1>

      {/* Team overview */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <h2
          className="text-lg text-ink mb-4"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          {team?.name || "Your team"}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-light mb-1">Seats</p>
            <p className="text-2xl font-semibold text-ink">
              {members?.length ?? 0} / {team?.seat_count ?? 5}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-light mb-1">Plan</p>
            <p className="text-sm font-medium text-amber-700 capitalize">
              {team?.plan || "team"}
            </p>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="bg-white rounded-card border border-border p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg text-ink"
            style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
          >
            Members
          </h2>
          <button className="bg-primary text-white text-xs rounded-pill px-3 py-1.5 hover:bg-primary-dark transition-colors">
            Invite member
          </button>
        </div>
        {members && members.length > 0 ? (
          <ul className="divide-y divide-border">
            {(members as Member[]).map((m) => (
              <li key={m.id} className="py-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-light rounded-full flex items-center justify-center text-primary text-sm font-medium flex-shrink-0">
                  {(m.full_name || m.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">
                    {m.full_name || m.email}
                  </p>
                  <p className="text-xs text-ink-light truncate">{m.email}</p>
                </div>
                <span
                  className={`text-xs rounded-pill px-2 py-0.5 ${
                    m.team_opt_in
                      ? "bg-green-50 text-green-700"
                      : "bg-bg text-ink-light border border-border"
                  }`}
                >
                  {m.team_opt_in ? "Sharing on" : "Sharing off"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-light">
            No members yet. Invite your team to get started.
          </p>
        )}
      </section>

      {/* Aggregated usage */}
      <section className="bg-white rounded-card border border-border p-6">
        <h2
          className="text-lg text-ink mb-2"
          style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
        >
          Team usage
        </h2>
        <p className="text-sm text-ink-light">
          Aggregated team insights are coming soon. Data appears here once
          members have opted into data sharing and used Lumen for at least a
          week.
        </p>
      </section>
    </div>
  );
}
