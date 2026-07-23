"use client";

import { useCallback, useEffect, useState } from "react";

type CalendarOption = { id: string; name: string; primary: boolean };
type CalendarConnection = {
  connected: boolean;
  reauthorize?: boolean;
  calendars: CalendarOption[];
  selectedCalendarIds: string[];
};

export default function GoogleCalendarConnection() {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showCalendarChoices, setShowCalendarChoices] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/calendars", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as CalendarConnection & { error?: string } | null;
      if (!response.ok || !data) throw new Error(data?.error || "Could not load Calendar settings.");
      setConnection(data);
      setSelectedCalendarIds(data.selectedCalendarIds || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load Calendar settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("calendar");
    if (!status) return;
    if (status === "connected") {
      setError(null);
      void load();
    } else if (status === "cancelled") {
      setError("Calendar connection was cancelled.");
    } else if (status === "configuration-required") {
      setError("Calendar connection is still being configured. Please try again shortly.");
    } else {
      setError("Calendar connection could not be completed. Please try again.");
    }
    window.history.replaceState({}, "", "/dashboard/settings#connected-accounts");
  }, [load]);

  function connect() {
    window.location.assign("/api/calendar/oauth/start?next=/dashboard/settings");
  }

  function toggleCalendar(id: string) {
    setError(null);
    setSelectedCalendarIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function saveChoices() {
    if (!selectedCalendarIds.length) {
      setError("Choose at least one calendar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCalendarIds }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not save your calendar choices.");
      await load();
      setShowCalendarChoices(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your calendar choices.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Calendar? Beckett will stop reading upcoming events.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google_calendar", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not disconnect Google Calendar.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disconnect Google Calendar.");
    } finally {
      setDisconnecting(false);
    }
  }

  const needsReconnect = connection?.connected && connection.reauthorize;

  return <div id="connected-accounts" className="border-t border-border pt-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="mt-0.5 text-lg">📅</span><div><p className="text-sm font-medium text-ink">Google Calendar</p><p className="text-xs text-ink-light">Read-only upcoming-meeting context from the calendars you choose.</p></div></div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{connection?.connected && <span className={`rounded-pill px-3 py-1 text-xs font-medium ${needsReconnect ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{needsReconnect ? "Needs reconnection" : "Connected"}</span>}{connection?.connected && !connection.reauthorize && <button type="button" onClick={() => setShowCalendarChoices((current) => !current)} className="rounded-pill border border-border px-4 py-1.5 text-xs text-ink hover:bg-bg">{showCalendarChoices ? "Done changing calendars" : "Change connected calendars"}</button>}<button type="button" onClick={connect} disabled={disconnecting} className="rounded-pill border border-border px-4 py-1.5 text-xs text-ink hover:bg-bg">{connection?.connected ? "Reconnect" : "Connect"}</button>{connection?.connected && <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="rounded-pill border border-red-200 px-4 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60">{disconnecting ? "Disconnecting…" : "Disconnect"}</button>}</div>
    </div>
    {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    {connection?.connected && !connection.reauthorize && showCalendarChoices && connection.calendars.length > 0 && <div className="mt-4 rounded-sm border border-border bg-bg/50 p-4"><p className="text-sm font-medium text-ink">Calendars Beckett can use</p><p className="mt-1 text-xs text-ink-mid">Only selected calendars are included in your week view and suggestions.</p><div className="mt-3 space-y-2">{connection.calendars.map((calendar) => <label key={calendar.id} className="flex cursor-pointer items-center gap-3 rounded-sm border border-border bg-white px-3 py-2 text-sm text-ink"><input type="checkbox" checked={selectedCalendarIds.includes(calendar.id)} onChange={() => toggleCalendar(calendar.id)} className="h-4 w-4 accent-primary" /><span>{calendar.name}{calendar.primary ? " (primary)" : ""}</span></label>)}</div><button type="button" onClick={() => void saveChoices()} disabled={saving || !selectedCalendarIds.length} className="mt-4 rounded-pill bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-60">{saving ? "Saving…" : "Save calendar choices"}</button></div>}
  </div>;
}
