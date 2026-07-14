export type BetaMissionKey =
  | "complete_profile"
  | "connect_extension"
  | "analyze_with_extension"
  | "connect_gmail"
  | "connect_slack"
  | "try_slack_coaching"
  | "practice_conversation"
  | "complete_course"
  | "save_toolkit_item";

export type BetaMissionStatus = "active" | "completed" | "skipped";
export type BetaMissionCompletionSource = "automatic" | "self_reported" | null;
export type BetaMissionFeedbackRating = "helpful" | "not_helpful" | null;

export type BetaMissionDefinition = {
  key: BetaMissionKey;
  category: "Set up" | "Gmail" | "Slack" | "Practice" | "Skills";
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  external?: boolean;
};

export type BetaMissionView = BetaMissionDefinition & {
  id: string;
  position: number;
  status: BetaMissionStatus;
  completionSource: BetaMissionCompletionSource;
  completedAt: string | null;
  skippedAt: string | null;
  feedbackRating: BetaMissionFeedbackRating;
  feedbackComment: string | null;
};

export type BetaMissionsResponse = {
  missions: BetaMissionView[];
  visibleMissions: BetaMissionView[];
  completedCount: number;
  skippedCount: number;
  totalCount: number;
};

export const BETA_MISSION_DEFINITIONS: Record<BetaMissionKey, BetaMissionDefinition> = {
  complete_profile: {
    key: "complete_profile",
    category: "Set up",
    title: "Personalize your About Me",
    description: "Add how you communicate, what helps, and what tends to make work conversations harder.",
    actionLabel: "Open About Me",
    href: "/dashboard/about",
  },
  connect_extension: {
    key: "connect_extension",
    category: "Set up",
    title: "Install the Beckett extension",
    description: "Add Beckett to Chrome so you can test coaching where messages already happen.",
    actionLabel: "Install extension",
    href: "https://chromewebstore.google.com/detail/beckett/calejchnmkljjkgchnodpdojmammmddk",
    external: true,
  },
  analyze_with_extension: {
    key: "analyze_with_extension",
    category: "Gmail",
    title: "Try Beckett on a real message",
    description: "Use the extension to decode, respond to, or rewrite one message. Remove private details if needed.",
    actionLabel: "Check connections",
    href: "/dashboard/settings",
  },
  connect_gmail: {
    key: "connect_gmail",
    category: "Gmail",
    title: "Connect Gmail",
    description: "Connect Gmail so Beckett can use the email context you choose to share.",
    actionLabel: "Connect Gmail",
    href: "/dashboard/settings",
  },
  connect_slack: {
    key: "connect_slack",
    category: "Slack",
    title: "Connect Slack",
    description: "Connect your Slack account to test personalized coaching and conversation context.",
    actionLabel: "Connect Slack",
    href: "/dashboard/settings",
  },
  try_slack_coaching: {
    key: "try_slack_coaching",
    category: "Slack",
    title: "Try one Slack coaching flow",
    description: "Decode, respond, rewrite, or prep in Slack, then return here to tell us how it went.",
    actionLabel: "Check Slack setup",
    href: "/dashboard/settings",
  },
  practice_conversation: {
    key: "practice_conversation",
    category: "Practice",
    title: "Practice a conversation",
    description: "Role-play a real conversation for at least a few turns and notice whether the pushback feels realistic.",
    actionLabel: "Start practice",
    href: "/dashboard/practice",
  },
  complete_course: {
    key: "complete_course",
    category: "Skills",
    title: "Complete one short skill",
    description: "Finish a skill module and check whether the coaching feels useful and easy to follow.",
    actionLabel: "Choose a skill",
    href: "/dashboard/skills",
  },
  save_toolkit_item: {
    key: "save_toolkit_item",
    category: "Skills",
    title: "Save something to your toolkit",
    description: "Save a phrase or communication preference you would genuinely want Beckett to remember.",
    actionLabel: "Open skills",
    href: "/dashboard/skills",
  },
};

const ROTATING_MISSIONS: BetaMissionKey[] = [
  "connect_extension",
  "practice_conversation",
  "connect_slack",
  "complete_course",
  "connect_gmail",
  "try_slack_coaching",
  "save_toolkit_item",
  "analyze_with_extension",
];

function stableCohort(userId: string) {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % ROTATING_MISSIONS.length;
}

export function getBetaMissionOrder(userId: string): BetaMissionKey[] {
  const offset = stableCohort(userId);
  const rotated = [
    ...ROTATING_MISSIONS.slice(offset),
    ...ROTATING_MISSIONS.slice(0, offset),
  ];
  return ["complete_profile", ...rotated];
}

export function getBetaMissionDefinition(key: string) {
  return BETA_MISSION_DEFINITIONS[key as BetaMissionKey] || null;
}
