import { NextRequest, NextResponse } from "next/server";
import { decryptGoogleAccessToken } from "@/lib/google-token-security";
import { getGoogleCalendarOAuthConfig, parseGoogleCalendarCredential } from "@/lib/google-calendar-oauth";
import { supabaseAdmin } from "@/lib/server-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type CalendarMetadata = {
  selectedCalendarIds?: unknown;
  [key: string]: unknown;
};

function selectedCalendarIds(metadata: CalendarMetadata | null) {
  const ids = Array.isArray(metadata?.selectedCalendarIds)
    ? metadata.selectedCalendarIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return ids.length ? ids.slice(0, 10) : ["primary"];
}

async function currentIntegration(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const { data: integration, error } = await supabaseAdmin
    .from("user_integrations")
    .select("id, access_token, metadata")
    .eq("user_id", session.user.id)
    .eq("provider", "google_calendar")
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Could not read the calendar connection." }, { status: 500 }) };

  const credential = parseGoogleCalendarCredential(decryptGoogleAccessToken(integration?.access_token));
  const config = getGoogleCalendarOAuthConfig(new URL(request.url).origin);
  if (!integration || !credential || !config) return { error: NextResponse.json({ connected: false, calendars: [], selectedCalendarIds: [] }) };

  return { session, integration: { ...integration, metadata: (integration.metadata || {}) as CalendarMetadata }, credential };
}

export async function GET(request: NextRequest) {
  const result = await currentIntegration(request);
  if ("error" in result) return result.error;

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,primary,accessRole,selected)",
    { headers: { Authorization: `Bearer ${result.credential.accessToken}` }, cache: "no-store" }
  );
  if (response.status === 401 || response.status === 403) {
    return NextResponse.json({ connected: true, reauthorize: true, calendars: [], selectedCalendarIds: [] });
  }
  if (!response.ok) return NextResponse.json({ error: "Could not load your calendars." }, { status: 502 });

  const payload = (await response.json()) as {
    items?: Array<{ id?: string; summary?: string; primary?: boolean }>;
  };
  const calendars = (payload.items || [])
    .filter((calendar) => calendar.id && calendar.summary)
    .map((calendar) => ({ id: calendar.id as string, name: calendar.summary as string, primary: Boolean(calendar.primary) }));

  return NextResponse.json({
    connected: true,
    calendars,
    selectedCalendarIds: selectedCalendarIds(result.integration.metadata),
  });
}

export async function PUT(request: NextRequest) {
  const result = await currentIntegration(request);
  if ("error" in result) return result.error;

  const body = (await request.json().catch(() => null)) as { selectedCalendarIds?: unknown } | null;
  const selected = Array.isArray(body?.selectedCalendarIds)
    ? Array.from(new Set(body.selectedCalendarIds.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, 10)
    : [];
  if (!selected.length) return NextResponse.json({ error: "Choose at least one calendar." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("user_integrations")
    .update({ metadata: { ...result.integration.metadata, selectedCalendarIds: selected }, updated_at: new Date().toISOString() })
    .eq("id", result.integration.id);
  if (error) return NextResponse.json({ error: "Could not save your calendar choices." }, { status: 500 });

  return NextResponse.json({ selectedCalendarIds: selected });
}
