type BetaTrackerRow = {
  email: string;
  name: string | null;
  lifecycleStage: string | null;
  signedUpAt: string | null;
  approvedAt: string | null;
  inviteSentAt: string | null;
  lastActivityAt: string | null;
  approved: boolean;
  accountCreatedAt: string | null;
  onboardedAt: string | null;
  extensionConnectedAt: string | null;
  gmailConnectedAt: string | null;
  slackConnectedAt: string | null;
  analysisCount: number;
  firstAnalysisAt: string | null;
  courseCompletions: number;
  feedbackCount: number;
  negativeFeedbackCount: number;
  lastFeedbackAt: string | null;
  recentEvents: BetaEventSummary[];
};

type BetaEventSummary = {
  eventName: string;
  source: string;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-green-50 text-green-700" : "bg-bg text-ink-light"
      }`}
    >
      {ok ? "OK" : "-"} {label}
    </span>
  );
}

export default function AdminBetaTracker({ rows }: { rows: BetaTrackerRow[] }) {
  const signedIn = rows.filter((row) => row.accountCreatedAt).length;
  const extension = rows.filter((row) => row.extensionConnectedAt).length;
  const gmail = rows.filter((row) => row.gmailConnectedAt).length;
  const slack = rows.filter((row) => row.slackConnectedAt).length;
  const feedback = rows.filter((row) => row.feedbackCount > 0).length;
  const active = rows.filter((row) => row.lastActivityAt).length;

  return (
    <section className="mt-10">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">Beta tracker</h2>
        <p className="text-sm text-ink-mid">
          Lifecycle view for beta signups, setup, analyses, courses, and feedback.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-6">
        <Metric label="Users" value={rows.length} />
        <Metric label="Signed in" value={signedIn} />
        <Metric label="Extension" value={extension} />
        <Metric label="Gmail / Slack" value={`${gmail} / ${slack}`} />
        <Metric label="Feedback" value={feedback} />
        <Metric label="Active" value={active} />
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-bg/70 text-xs uppercase tracking-wide text-ink-light">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Lifecycle</th>
              <th className="px-4 py-3 font-medium">Connections</th>
              <th className="px-4 py-3 font-medium">Activity</th>
              <th className="px-4 py-3 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-ink-mid" colSpan={5}>
                  No beta users yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.email} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-medium text-ink">{row.name || row.email}</p>
                    <p className="text-xs text-ink-light">{row.name ? row.email : ""}</p>
                    <p className="mt-1 text-xs text-ink-light">Signed up {formatDate(row.signedUpAt)}</p>
                    <p className="text-xs text-ink-light">Stage: {row.lifecycleStage || "unknown"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Check ok={row.approved} label="approved" />
                      <Check ok={Boolean(row.accountCreatedAt)} label="signed in" />
                      <Check ok={Boolean(row.onboardedAt)} label="onboarded" />
                    </div>
                    <p className="mt-2 text-xs text-ink-light">Invite: {formatDate(row.inviteSentAt)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Check ok={Boolean(row.extensionConnectedAt)} label="extension" />
                      <Check ok={Boolean(row.gmailConnectedAt)} label="Gmail" />
                      <Check ok={Boolean(row.slackConnectedAt)} label="Slack" />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-ink-mid">
                    <p>{row.analysisCount} analyses</p>
                    <p className="text-xs text-ink-light">First: {formatDate(row.firstAnalysisAt)}</p>
                    <p className="text-xs text-ink-light">{row.courseCompletions} courses completed</p>
                    <p className="text-xs text-ink-light">Last active: {formatDate(row.lastActivityAt)}</p>
                  </td>
                  <td className="px-4 py-4 text-ink-mid">
                    <p>{row.feedbackCount} reports</p>
                    <p className="text-xs text-ink-light">{row.negativeFeedbackCount} need improvement</p>
                    <p className="text-xs text-ink-light">Last: {formatDate(row.lastFeedbackAt)}</p>
                    {row.recentEvents.length ? (
                      <div className="mt-2 space-y-1">
                        {row.recentEvents.slice(0, 2).map((event) => (
                          <p className="text-xs text-ink-light" key={`${row.email}-${event.eventName}-${event.createdAt}`}>
                            {event.eventName} · {event.source} · {formatDate(event.createdAt)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export type { BetaTrackerRow };
