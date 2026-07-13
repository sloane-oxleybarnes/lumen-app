type ExcerptIntent = "respond" | "rewrite" | "decode" | "prep" | "practice";

function escapeSlackText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function removeWrappingQuotes(text: string) {
  const trimmed = text.trim();
  const pairs: Array<[string, string]> = [["\"", "\""], ["“", "”"], ["'", "'"]];
  const pair = pairs.find(([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end));
  return pair && trimmed.length > 2 ? trimmed.slice(1, -1).trim() : trimmed;
}

export function buildSlackCommandExcerpt(intent: ExcerptIntent, rawText?: string | null) {
  if (intent !== "decode" && intent !== "respond" && intent !== "rewrite") return "";
  const normalized = removeWrappingQuotes(String(rawText || "").replace(/\s+/g, " ").trim());
  if (!normalized) return "";
  const excerpt = normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}…` : normalized;
  const label = intent === "rewrite" ? "Original draft" : "Original message";
  return `${label}: “${escapeSlackText(excerpt)}”`;
}
