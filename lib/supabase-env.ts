function cleanEnvValue(value?: string | null) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  raw = raw.replace(/^['"]|['"]$/g, "");

  if (/^[A-Z0-9_]+=/.test(raw)) {
    raw = raw.slice(raw.indexOf("=") + 1).trim();
  }

  return raw.replace(/^['"]|['"]$/g, "");
}

export function normalizeSupabaseUrl(value?: string | null) {
  let raw = cleanEnvValue(value);
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) {
    raw = /^(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  }

  try {
    const url = new URL(raw);
    if (url.pathname.replace(/\/+$/, "") === "/rest/v1") {
      return url.origin;
    }
    return url.origin;
  } catch {
    return "";
  }
}

export function getSupabaseUrl() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Use the Supabase project URL, for example https://your-project.supabase.co, without /rest/v1."
    );
  }
  return url;
}

export function getSupabaseAnonKey() {
  const key = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return key;
}

export function getSupabaseServiceRoleKey() {
  const key = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return key;
}
