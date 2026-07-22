export const PROACTIVITY_PREFERENCES = [
  "wait_until_asked",
  "quiet_prompt",
  "direct_interrupt",
] as const;

export type ProactivityPreference = (typeof PROACTIVITY_PREFERENCES)[number];

export const DEFAULT_PROACTIVITY_PREFERENCE: ProactivityPreference = "wait_until_asked";

export const proactivityOptions: Array<{
  value: ProactivityPreference;
  label: string;
  description: string;
}> = [
  {
    value: "wait_until_asked",
    label: "Wait until I ask",
    description: "Beckett only helps when you open it or ask for support.",
  },
  {
    value: "quiet_prompt",
    label: "Quiet prompt",
    description: "Allow a low-key suggestion inside Beckett when you choose to check in.",
  },
  {
    value: "direct_interrupt",
    label: "Active interruption",
    description: "Save this as a future preference. Beckett will not interrupt your work during beta.",
  },
];
