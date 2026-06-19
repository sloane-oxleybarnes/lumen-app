import { NextRequest, NextResponse } from "next/server";
import { getExtensionProfile } from "@/lib/extension-auth";
import { supabaseAdmin } from "@/lib/server-admin";

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

async function resolveThread(token: string, hints: {
  threadIds: string[];
  messageIds: string[];
  subject: string;
  senderEmail: string;
  visibleText: string;
}) {
  const attempted = new Set<string>();
  const candidates = new Map<string, GmailThread>();

  async function tryThread(rawId: string) {
    const id = normalizeId(rawId);
    if (!id || attempted.has(`thread:${id}`)) return;
    attempted.add(`thread:${id}`);
    try {
      const thread = await getThread(token, id);
      if (thread.id && Array.isArray(thread.messages)) candidates.set(thread.id, thread);
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
      if (message.threadId) await tryThread(message.threadId);
    } catch (error) {
      if (error instanceof Error && error.message === "gmail_token_expired") throw error;
    }
  }

  async function trySearch(query: string) {
    if (!query || attempted.has(`search:${query}`)) return;
    attempted.add(`search:${query}`);
    try {
      const messages = await searchMessages(token, query);
      for (const message of messages) {
        if (message.threadId) await tryThread(message.threadId);
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
    await trySearch(`subject:"${escapeGmailQuery(hints.subject)}" from:${hints.senderEmail}`);
    await trySearch(`subject:"${escapeGmailQuery(hints.subject)}" to:${hints.senderEmail}`);
  }
  if (hints.subject) await trySearch(`subject:"${escapeGmailQuery(hints.subject)}"`);

  const phrase = extractSearchPhrase(hints.visibleText);
  if (phrase) await trySearch(`"${escapeGmailQuery(phrase)}"`);

  return Array.from(candidates.values()).sort((a, b) => (b.messages?.length || 0) - (a.messages?.length || 0))[0] || null;
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

  if (!integration?.access_token) return jsonError("google_not_connected", 404);

  try {
    const thread = await resolveThread(integration.access_token, {
      threadIds: splitParam(searchParams.get("threadIds")),
      messageIds: splitParam(searchParams.get("messageIds")),
      subject: searchParams.get("subject")?.trim() || "",
      senderEmail: searchParams.get("senderEmail")?.trim() || "",
      visibleText: searchParams.get("visibleText")?.trim() || "",
    });

    if (!thread?.messages?.length) return jsonError("thread_not_found", 404);

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

    return NextResponse.json({
      source: "gmail_api",
      threadId: thread.id,
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gmail_api_error";
    if (message === "gmail_token_expired") return jsonError("gmail_token_expired", 401);
    return jsonError(message.startsWith("gmail_api_error") ? message : "gmail_api_error", 500);
  }
}
