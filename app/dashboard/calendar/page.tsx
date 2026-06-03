export default function CalendarPage() {
  return (
    <div className="max-w-lg">
      <h1
        className="text-3xl text-ink mb-2"
        style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}
      >
        Calendar
      </h1>
      <p className="text-ink-mid text-sm mb-8">
        See what is coming up and prepare before you walk in.
      </p>

      <div className="bg-white border border-border rounded-card p-10 text-center">
        <p className="text-3xl mb-4">📅</p>
        <h2 className="text-base font-medium text-ink mb-2">
          Calendar integration coming soon
        </h2>
        <p className="text-sm text-ink-mid leading-relaxed max-w-sm mx-auto">
          Connect your Google Calendar to see upcoming meetings, who is
          attending, and get a pre-meeting brief before you walk in.
        </p>
        <p className="text-xs text-ink-light mt-6">
          For now, calendar access is available in the Beckett Chrome extension.
        </p>
      </div>
    </div>
  );
}
