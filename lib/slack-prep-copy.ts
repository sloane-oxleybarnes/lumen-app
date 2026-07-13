const PREP_LABELS = ["Goal", "Say this first", "If they push back"] as const;

export function formatSlackPrepAssessment(compactText: string) {
  const sections = new Map<string, string>();

  for (const line of compactText.split("\n")) {
    const match = line.trim().match(/^(?:~\s*)?(Goal|Say this first|If they push back)(?:\s*~)?\s*:?\s*(.*)$/i);
    if (match) sections.set(match[1].toLowerCase(), match[2].trim());
  }

  if (sections.size < PREP_LABELS.length) return compactText.trim();

  // The model is already instructed to keep Prep concise. Preserve its complete
  // coaching sentences here instead of cutting each section at an arbitrary
  // character count, which can remove the user's ask or the useful pushback reply.
  return PREP_LABELS.map((label) => {
    const content = sections.get(label.toLowerCase()) || "";
    return `~ ${label} ~ ${content}`.trim();
  }).join("\n");
}
