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
    label: "Dashboard only",
    description: "Refresh Today when you open Beckett. No notifications.",
  },
  {
    value: "quiet_prompt",
    label: "Gentle notifications",
    description: "Allow optional browser, desktop, or mobile nudges where you turn them on.",
  },
  {
    value: "direct_interrupt",
    label: "More proactive support",
    description: "Save a future preference for timely suggestions. Beckett never changes your calendar without approval.",
  },
];
