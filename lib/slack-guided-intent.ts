export function isUserCorrectingWrongFlow(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return false;

  // A standalone correction can begin with "No," but ordinary goals such as
  // "no more than once a month" must remain answers inside the active flow.
  if (/^no\s+more\b/i.test(cleaned)) return false;
  return /^(?:no[,!.?]\s*)/i.test(cleaned) ||
    /\b(not what i mean|that's not what i mean|that is not what i mean|you'?re not responding|you are not responding|i want to know if|i'?m asking if|i asked if)\b/i.test(cleaned);
}
