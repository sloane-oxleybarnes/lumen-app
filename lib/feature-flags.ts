export type FeatureFlag =
  | "inline_editor"
  | "meeting_guidance"
  | "calendar_prep"
  | "relationship_memory"
  | "personal_expansion"
  | "regulation_dashboard"
  | "proactive_coaching";

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  inline_editor: false,
  meeting_guidance: false,
  calendar_prep: false,
  relationship_memory: false,
  personal_expansion: false,
  regulation_dashboard: false,
  proactive_coaching: false,
};

function envKey(flag: FeatureFlag) {
  return `FEATURE_${flag.toUpperCase()}`;
}

export function isFeatureEnabled(flag: FeatureFlag) {
  const value = process.env[envKey(flag)];
  if (!value) return DEFAULT_FLAGS[flag];
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getFeatureFlags() {
  return Object.fromEntries(
    (Object.keys(DEFAULT_FLAGS) as FeatureFlag[]).map((flag) => [flag, isFeatureEnabled(flag)])
  ) as Record<FeatureFlag, boolean>;
}
