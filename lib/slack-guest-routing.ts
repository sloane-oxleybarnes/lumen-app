export type GuestStarterIntent = "decode" | "respond" | "rewrite" | "prep";

const GUEST_STARTER_INTENTS = new Map<string, GuestStarterIntent>([
  ["help me decode the current message without over-reading it.", "decode"],
  ["show me how to decode a specific slack message with beckett.", "decode"],
  ["help me decode a slack message.", "decode"],
  ["help me draft a clear response to the current conversation.", "respond"],
  ["show me how to draft a response from a specific slack message with beckett.", "respond"],
  ["help me draft a response to a slack message.", "respond"],
  ["help me rewrite my response so it is clearer and kinder.", "rewrite"],
  ["help me rewrite this draft so it is clearer and kinder.", "rewrite"],
  ["help me rewrite a draft.", "rewrite"],
  ["help me prepare for a difficult conversation.", "prep"],
]);

export function guestStarterIntent(text: string) {
  return GUEST_STARTER_INTENTS.get(text.trim().toLowerCase()) || null;
}

export function isGuestStarterPrompt(text: string) {
  return Boolean(guestStarterIntent(text));
}

export function shouldLoadGuestConversationContext(input: {
  selectedMessageText?: string | null;
  selectedMessageTs?: string | null;
  threadTs?: string | null;
  latestMessageText?: string | null;
}) {
  return Boolean(
    input.selectedMessageText?.trim() ||
    input.selectedMessageTs ||
    input.threadTs ||
    input.latestMessageText?.trim()
  );
}

export function buildGuestSlashCoachingPrompt(
  intent: "respond" | "rewrite" | "decode" | "prep" | "practice",
  prompt: string,
  targetMessage?: string | null
) {
  const exactText = (targetMessage || prompt).trim();

  if (intent === "respond") {
    return [
      "Draft replies to the exact message below now.",
      "Return exactly three concise Slack-ready options labeled Confirm, Negotiate, and Clarify.",
      "Make the most reasonable common interpretation. Do not ask a setup question before the drafts.",
      "Do not use or mention any conversation outside this request.",
      `Exact message: ${exactText}`,
    ].join("\n");
  }

  if (intent === "rewrite") {
    return [
      "Rewrite the exact draft below now.",
      "Return exactly three concise Slack-ready versions with useful tone labels.",
      "Preserve the user's meaning, request, and boundaries. Do not automatically make the message softer.",
      "Do not ask a setup question and do not use or mention any conversation outside this request.",
      `Exact draft: ${exactText}`,
    ].join("\n");
  }

  if (intent === "decode") {
    return [
      "Decode only the exact message below.",
      "Separate what the wording directly shows from plausible interpretations. State uncertainty clearly.",
      "Do not use or mention any conversation outside this request.",
      `Exact message: ${exactText}`,
    ].join("\n");
  }

  return prompt;
}

export function extractGuestPrepOutcomeAndConcern(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const concernMatch = cleaned.match(
    /\b(?:i(?:['’]m| am) (?:worried|concerned|afraid|nervous)|my (?:main )?concern is|i fear|i (?:do not|don['’]t) want)\b/i
  );
  if (!concernMatch || concernMatch.index === undefined) {
    return { outcome: cleaned || null, concern: null };
  }

  const beforeConcern = cleaned
    .slice(0, concernMatch.index)
    .replace(/[\s,;:-]*(?:but|and)?\s*$/i, "")
    .trim();
  const concernTail = cleaned.slice(concernMatch.index).trim();
  const firstConcernSentence = concernTail.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  const concern = (firstConcernSentence || concernTail)
    .replace(/\s+(?:where|what(?:'s| is) the best place|should (?:i|we) have)\b[\s\S]*$/i, "")
    .trim();

  return {
    outcome: beforeConcern || null,
    concern: concern || null,
  };
}

export function guestPracticeOpening(
  persona: string,
  location: "written" | "call" | "in_person"
) {
  if (location === "written") {
    if (persona === "your manager") return "Hi—what did you want to talk through?";
    return "Hi—what would you like to discuss?";
  }
  if (persona === "your manager") return "Hey, I have a few minutes—what's on your mind?";
  if (persona === "your client") return "Hi—what would you like to discuss?";
  if (persona === "your direct report") return "Hey—what did you want to talk about?";
  return "Hey—what's on your mind?";
}
