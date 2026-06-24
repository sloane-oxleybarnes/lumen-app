import { NextRequest, NextResponse } from "next/server";
import { getExtensionProfile } from "@/lib/extension-auth";
import { supabaseAdmin } from "@/lib/server-admin";

export const runtime = "nodejs";

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};
type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};
type GmailThreadCandidate = {
  thread: GmailThread;
  sources: Set<string>;
};
type GoogleIntegration = {
  access_token: string | null;
  external_user_id: string | null;
  metadata: unknown;
};

function jsonError(code: string, status = 400) {
  return NextResponse.json({ error: code }, { status });
}

function normalizeId(value: string | null | undefined) {
  return String(value || "")
    .replace(/^#?msg-/, "")
    .replace(/^msg-/, "")
    .replace(/^thread-/, "")
    .replace(/^#/, "")
    .trim();
}

function splitParam(value: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripRfc822Brackets(value: string) {
  return normalizeId(value).replace(/^<|>$/g, "");
}

function escapeGmailQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractSearchPhrase(text: string | null) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/On .+ wrote:.*/i, "")
    .trim();
  const sentence = cleaned
    .split(/(?<=[.!?])\s+/)
    .find((part) => part.length >= 18 && part.length <= 120);
  return (sentence || cleaned.slice(0, 90)).trim();
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function getRefreshToken(metadata: Record<string, unknown>) {
  return typeof metadata.refresh_token === "string" && metadata.refresh_token.trim()
    ? metadata.refresh_token.trim()
    : "";
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function threadContainsVisibleText(thread: GmailThread, visibleText: string) {
  const phrase = normalizeSearchText(extractSearchPhrase(visibleText));
  if (phrase.length < 18) return false;
  const body = normalizeSearchText(
    (thread.messages || [])
      .map((message) => extractBody(message.payload) || message.snippet || "")
      .join(" ")
  );
  return body.includes(phrase);
}

async function updateGoogleIntegrationMetadata(userId: string, metadata: Record<string, unknown>) {
  await supabaseAdmin
    .from("user_integrations")
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");
}

async function noteGoogleValidation(userId: string, metadata: Record<string, unknown>, failureReason: string | null) {
  await updateGoogleIntegrationMetadata(userId, {
    ...metadata,
    last_validated_at: new Date().toISOString(),
    last_failure_reason: failureReason,
  });
}

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractBody(part?: GmailPart): string {
  if (!part) return "";

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    return part.mimeType === "text/html" ? stripHtml(decoded) : decoded.trim();
  }

  const parts = part.parts || [];
  for (const child of parts) {
    if (child.mimeType === "text/plain" && child.body?.data) return decodeBase64Url(child.body.data).trim();
  }
  for (const child of parts) {
    if (child.mimeType === "text/html" && child.body?.data) return stripHtml(decodeBase64Url(child.body.data));
  }
  for (const child of parts) {
    const nested = extractBody(child);
    if (nested) return nested;
  }

  return "";
}

function header(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseSender(fromRaw: string) {
  const emailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s<>]+@[^\s<>]+)/);
  const senderEmail = emailMatch ? emailMatch[1].toLowerCase() : "";
  const sender = fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || fromRaw || "Unknown";
  return { sender, senderEmail };
}

async function gmailFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("gmail_token_expired");
  }
  if (!res.ok) throw new Error(`gmail_api_error:${res.status}`);
  return res.json() as Promise<T>;
}

async function getThread(token: string, threadId: string) {
  return gmailFetch<GmailThread>(token, `threads/${encodeURIComponent(threadId)}?format=full`);
}

async function getMessage(token: string, messageId: string) {
  return gmailFetch<GmailMessage>(token, `messages/${encodeURIComponent(messageId)}?format=metadata`);
}

async function searchMessages(token: string, query: string, maxResults = 10) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const data = await gmailFetch<{ messages?: GmailMessage[] }>(token, `messages?${params.toString()}`);
  return data.messages || [];
}

async function refreshGoogleAccessToken(userId: string, integration: GoogleIntegration, metadata: Record<string, unknown>) {
  const refreshToken = getRefreshToken(metadata);
  if (!refreshToken) throw new Error("google_refresh_token_missing");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("google_refresh_not_configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error || "google_refresh_failed");

  const now = new Date();
  const refreshedMetadata = {
    ...metadata,
    has_refresh_token: true,
    last_validated_at: now.toISOString(),
    last_failure_reason: null,
    token_refreshed_at: now.toISOString(),
    token_expires_at: data.expires_in ? new Date(now.getTime() + data.expires_in * 1000).toISOString() : null,
  };

  await supabaseAdmin
    .from("user_integrations")
    .update({
      access_token: data.access_token,
      metadata: refreshedMetadata,
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");

  integration.access_token = data.access_token;
  integration.metadata = refreshedMetadata;
  return data.access_token;
}

async function resolveThread(token: string, hints: {
  threadIds: string[];
  messageIds: string[];
  subject: string;
  senderEmail: string;
  visibleText: string;
}) {
  const attempted = new Set<string>();
  const candidates = new Map<string, GmailThreadCandidate>();

  function addCandidate(thread: GmailThread, source: string) {
    if (!thread.id || !Array.isArray(thread.messages)) return;
    const existing = candidates.get(thread.id);
    if (existing) {
      existing.sources.add(source);
      return;
    }
    candidates.set(thread.id, { thread, sources: new Set([source]) });
  }

  async function tryThread(rawId: string, source = "thread_id") {
    const id = normalizeId(rawId);
    if (!id || attempted.has(`thread:${id}`)) return;
    attempted.add(`thread:${id}`);
    try {
      const thread = await getThread(token, id);
      addCandidate(thread, source);
    } catch (error) {
      if (error instanceof Error && error.message === "gmail_token_expired") throw error;
    }
  }

  async function tryMessage(rawId: string) {
    const id = normalizeId(rawId);
    if (!id || attempted.has(`message:${id}`)) return;
    attempted.add(`message:${id}`);
    try {
      const message = await getMessage(token, id);
      if (message.threadId) await tryThread(message.threadId, "message_id");
    } catch (error) {
      if (error instanceof Error && error.message === "gmail_token_expired") throw error;
    }
  }

  async function trySearch(query: string, source = "search") {
    if (!query || attempted.has(`search:${query}`)) return;
    attempted.add(`search:${query}`);
    try {
      const messages = await searchMessages(token, query);
      for (const message of messages) {
        if (message.threadId) await tryThread(message.threadId, source);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "gmail_token_expired") throw error;
    }
  }

  for (const id of hints.threadIds) await tryThread(id);

  for (const id of hints.messageIds) {
    await tryMessage(id);
    const stripped = stripRfc822Brackets(id);
    await trySearch(`rfc822msgid:${stripped}`);
    await trySearch(`rfc822msgid:<${stripped}>`);
  }

  if (hints.subject && hints.senderEmail) {
    await trySearch(`subject:"${escapeGmailQuery(hints.subject)}" from:${hints.senderEmail}`, "subject_sender");
    await trySearch(`subject:"${escapeGmailQuery(hints.subject)}" to:${hints.senderEmail}`, "subject_sender");
  }
  if (hints.subject) await trySearch(`subject:"${escapeGmailQuery(hints.subject)}"`, "subject");

  const phrase = extractSearchPhrase(hints.visibleText);
  if (phrase) await trySearch(`"${escapeGmailQuery(phrase)}"`, "visible_text");

  const entries = Array.from(candidates.values());
  if (!entries.length) return null;

  const directMatches = entries.filter((candidate) => candidate.sources.has("thread_id") || candidate.sources.has("message_id"));
  if (directMatches.length) {
    return directMatches.sort((a, b) => (b.thread.messages?.length || 0) - (a.thread.messages?.length || 0))[0].thread;
  }

  const visibleMatches = entries.filter((candidate) => threadContainsVisibleText(candidate.thread, hints.visibleText));
  if (visibleMatches.length === 1) return visibleMatches[0].thread;
  if (visibleMatches.length > 1 || entries.length > 1) throw new Error("thread_match_ambiguous");

  return entries[0].thread;
}

export async function GET(req: NextRequest) {
  const profile = await getExtensionProfile(req);
  if (!profile) return jsonError("unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const { data: integration } = await supabaseAdmin
    .from("user_integrations")
    .select("access_token, external_user_id, metadata")
    .eq("user_id", profile.id)
    .eq("provider", "google")
    .single();

  if (!integration) return jsonError("google_not_connected", 404);
  const googleIntegration = integration as GoogleIntegration;
  const metadata = metadataRecord(googleIntegration.metadata);
  if (!googleIntegration.access_token && !getRefreshToken(metadata)) {
    await noteGoogleValidation(profile.id, metadata, "google_refresh_token_missing");
    return jsonError("google_refresh_token_missing", 401);
  }
  if (!googleIntegration.access_token && getRefreshToken(metadata)) {
    try {
      await refreshGoogleAccessToken(profile.id, googleIntegration, metadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : "google_refresh_failed";
      await noteGoogleValidation(profile.id, metadata, message);
      return jsonError(message, message === "google_refresh_not_configured" ? 501 : 401);
    }
  }

  try {
    const hints = {
      threadIds: splitParam(searchParams.get("threadIds")),
      messageIds: splitParam(searchParams.get("messageIds")),
      subject: searchParams.get("subject")?.trim() || "",
      senderEmail: searchParams.get("senderEmail")?.trim() || "",
      visibleText: searchParams.get("visibleText")?.trim() || "",
    };
    let token = googleIntegration.access_token;
    let thread: GmailThread | null = null;
    try {
      if (!token) throw new Error("google_refresh_token_missing");
      thread = await resolveThread(token, hints);
    } catch (error) {
      const message = error instanceof Error ? error.message : "gmail_api_error";
      if (message !== "gmail_token_expired") throw error;
      token = await refreshGoogleAccessToken(profile.id, googleIntegration, metadata);
      thread = await resolveThread(token, hints);
    }

    if (!thread?.messages?.length) {
      await noteGoogleValidation(profile.id, metadataRecord(googleIntegration.metadata), "thread_not_found");
      return jsonError("thread_not_found", 404);
    }

    const currentEmail =
      (integration.external_user_id || "").toLowerCase() ||
      (typeof integration.metadata === "object" && integration.metadata && "email" in integration.metadata
        ? String(integration.metadata.email).toLowerCase()
        : "") ||
      (profile.email || "").toLowerCase();

    const messages = thread.messages.map((message: GmailMessage) => {
      const headers = message.payload?.headers || [];
      const { sender, senderEmail } = parseSender(header(headers, "From"));
      return {
        sender,
        senderEmail,
        timestamp: header(headers, "Date"),
        messageId: header(headers, "Message-ID") || header(headers, "Message-Id") || message.id,
        body: extractBody(message.payload) || message.snippet || "",
        isCurrentUser: currentEmail ? senderEmail === currentEmail : false,
      };
    });

    await noteGoogleValidation(profile.id, metadataRecord(googleIntegration.metadata), null);

    return NextResponse.json({
      source: "gmail_api",
      contextStatus: "full_thread",
      threadId: thread.id,
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gmail_api_error";
    await noteGoogleValidation(profile.id, metadataRecord(googleIntegration.metadata), message);
    console.error("Extension Gmail thread lookup failed", {
      userId: profile.id,
      error: message,
    });
    if (message === "gmail_token_expired") return jsonError("gmail_token_expired", 401);
    if (message === "google_refresh_token_missing") return jsonError("google_refresh_token_missing", 401);
    if (message === "google_refresh_not_configured") return jsonError("google_refresh_not_configured", 501);
    if (message === "thread_match_ambiguous") return jsonError("thread_match_ambiguous", 409);
    return jsonError(message.startsWith("gmail_api_error") ? message : "gmail_api_error", 500);
  }
}
