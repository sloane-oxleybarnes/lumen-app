export type SafetyTopic = "crisis" | "relationship_safety" | "health" | "legal";
export const safetyResourceRegions = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "OTHER", label: "Another country or region" },
] as const;

export type SafetyResourceRegion = (typeof safetyResourceRegions)[number]["value"];

export const DEFAULT_SAFETY_RESOURCE_REGION: SafetyResourceRegion = "US";
export const SAFETY_RESOURCE_REVIEW_CADENCE_DAYS = 90;
export const SAFETY_RESOURCE_OWNER = "Beckett safety content team";

export type SafetyResponse = {
  topic: SafetyTopic;
  title: string;
  message: string;
  resources: Array<{ label: string; href: string }>;
  owner: string;
  reviewedAt: string;
  nextReviewAt: string;
  reviewCadenceDays: number;
  region: SafetyResourceRegion;
  usingUSFallback: boolean;
};

const TOPIC_PATTERNS: Array<{ topic: SafetyTopic; pattern: RegExp }> = [
  { topic: "crisis", pattern: /\b(kill myself|suicid(?:e|al)|self[- ]harm|hurt myself|end my life|want to die)\b/i },
  { topic: "relationship_safety", pattern: /\b(domestic abuse|abusive partner|he (?:hits|hurt)s me|she (?:hits|hurt)s me|being stalked|restraining order|coercive control)\b/i },
  { topic: "health", pattern: /\b(diagnos(?:e|is)|medication|therapy|therapist|panic attack|psychosis|manic|mental health crisis|medical advice)\b/i },
  { topic: "legal", pattern: /\b(lawsuit|sue|legal advice|attorney|lawyer|illegal|employment law|discrimination claim)\b/i },
];

type SafetyResourceTemplate = Omit<SafetyResponse, "region" | "usingUSFallback">;

const RESPONSES: Record<SafetyTopic, SafetyResourceTemplate> = {
  crisis: {
    topic: "crisis",
    title: "Immediate support matters here",
    message: "Beckett cannot provide crisis intervention. If you may be in immediate danger or might hurt yourself, contact local emergency services now. If you are in the U.S. or Canada, call or text 988 for the Suicide & Crisis Lifeline.",
    resources: [
      { label: "988 Suicide & Crisis Lifeline (U.S. and Canada)", href: "https://988lifeline.org/" },
      { label: "Find A Helpline (international)", href: "https://findahelpline.com/" },
    ],
    owner: SAFETY_RESOURCE_OWNER,
    reviewedAt: "2026-07-22",
    nextReviewAt: "2026-10-20",
    reviewCadenceDays: SAFETY_RESOURCE_REVIEW_CADENCE_DAYS,
  },
  relationship_safety: {
    topic: "relationship_safety",
    title: "Your safety comes first",
    message: "Beckett cannot provide safety planning or advice for abuse, coercion, or stalking. Consider contacting a specialized support service or someone you trust. If you are in immediate danger, contact local emergency services.",
    resources: [
      { label: "National Domestic Violence Hotline (U.S.)", href: "https://www.thehotline.org/" },
      { label: "NO MORE Global Directory", href: "https://nomoredirectory.org/" },
    ],
    owner: SAFETY_RESOURCE_OWNER,
    reviewedAt: "2026-07-22",
    nextReviewAt: "2026-10-20",
    reviewCadenceDays: SAFETY_RESOURCE_REVIEW_CADENCE_DAYS,
  },
  health: {
    topic: "health",
    title: "This needs qualified support",
    message: "Beckett cannot provide medical or mental-health advice. A licensed clinician, your care team, or an appropriate local support service can help with this directly.",
    resources: [
      { label: "Find A Helpline", href: "https://findahelpline.com/" },
      { label: "SAMHSA treatment locator (U.S.)", href: "https://findtreatment.gov/" },
    ],
    owner: SAFETY_RESOURCE_OWNER,
    reviewedAt: "2026-07-22",
    nextReviewAt: "2026-10-20",
    reviewCadenceDays: SAFETY_RESOURCE_REVIEW_CADENCE_DAYS,
  },
  legal: {
    topic: "legal",
    title: "This requires legal guidance",
    message: "Beckett cannot provide legal advice or assess a legal dispute. Consider your employee handbook, HR process, a legal-aid organization, or a qualified lawyer in your location.",
    resources: [
      { label: "Legal Services Corporation (U.S.)", href: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help" },
      { label: "LawHelp (U.S.)", href: "https://www.lawhelp.org/" },
    ],
    owner: SAFETY_RESOURCE_OWNER,
    reviewedAt: "2026-07-22",
    nextReviewAt: "2026-10-20",
    reviewCadenceDays: SAFETY_RESOURCE_REVIEW_CADENCE_DAYS,
  },
};

export function normalizeSafetyResourceRegion(region: unknown): SafetyResourceRegion {
  return safetyResourceRegions.some((option) => option.value === region)
    ? region as SafetyResourceRegion
    : DEFAULT_SAFETY_RESOURCE_REGION;
}

export function safetyResourceRegionLabel(region: SafetyResourceRegion) {
  return safetyResourceRegions.find((option) => option.value === region)?.label || "United States";
}

export function getSafetyResourceRegionNotice(region: SafetyResourceRegion) {
  if (region === "US") {
    return "You are viewing Beckett's reviewed U.S.-first resource set.";
  }
  return `Your selected region is ${safetyResourceRegionLabel(region)}. Beckett does not yet maintain a reviewed local directory for this region, so it is showing the clearly labelled U.S.-first fallback plus international directories where available. For immediate danger, contact local emergency services.`;
}

function forRegion(response: SafetyResourceTemplate, region: SafetyResourceRegion): SafetyResponse {
  return { ...response, region, usingUSFallback: region !== "US" };
}

export function getSafetyResponse(text: string, region?: unknown): SafetyResponse | null {
  const matched = TOPIC_PATTERNS.find(({ pattern }) => pattern.test(text));
  return matched ? forRegion(RESPONSES[matched.topic], normalizeSafetyResourceRegion(region)) : null;
}

export function allSafetyResources(region?: unknown) {
  const normalizedRegion = normalizeSafetyResourceRegion(region);
  return Object.values(RESPONSES).map((response) => forRegion(response, normalizedRegion));
}
