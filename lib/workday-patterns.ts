export const timeOfDayValues = ["morning", "midday", "afternoon", "evening"] as const;
export const workloadValues = ["light", "steady", "stacked"] as const;
export const breakStatusValues = ["taken", "not_taken", "would_help"] as const;
export const helpfulStrategyValues = [
  "quiet_block",
  "written_next_steps",
  "clearer_priority",
  "short_break",
  "draft_before_sending",
  "none_yet",
] as const;

export type WorkdayCheckin = {
  id?: string;
  time_of_day: (typeof timeOfDayValues)[number];
  workload_level: (typeof workloadValues)[number];
  energy_level: number;
  communication_friction: boolean;
  break_status: (typeof breakStatusValues)[number];
  helpful_strategy: (typeof helpfulStrategyValues)[number];
  checked_in_at?: string;
};

export type PatternSummary = {
  category: "load" | "friction" | "break" | "strategy";
  summary: string;
  evidence: { matchingCheckins: number; totalCheckins: number; periodDays: number };
};

const labels: Record<WorkdayCheckin["helpful_strategy"], string> = {
  quiet_block: "a quieter block of time",
  written_next_steps: "written next steps",
  clearer_priority: "a clearer priority",
  short_break: "a short break",
  draft_before_sending: "drafting before sending",
  none_yet: "no strategy yet",
};

export function makePatternSummaries(checkins: WorkdayCheckin[]): PatternSummary[] {
  if (checkins.length < 3) return [];
  const totalCheckins = checkins.length;
  const evidence = (matchingCheckins: number) => ({ matchingCheckins, totalCheckins, periodDays: 14 });
  const summaries: PatternSummary[] = [];

  const stacked = checkins.filter((checkin) => checkin.workload_level === "stacked").length;
  if (stacked >= 3) summaries.push({
    category: "load",
    summary: `You reported a stacked workload in ${stacked} of your last ${totalCheckins} check-ins.`,
    evidence: evidence(stacked),
  });

  const friction = checkins.filter((checkin) => checkin.communication_friction).length;
  if (friction >= 3) summaries.push({
    category: "friction",
    summary: `You marked communication friction in ${friction} of your last ${totalCheckins} check-ins.`,
    evidence: evidence(friction),
  });

  const breakNeed = checkins.filter((checkin) => checkin.break_status !== "taken").length;
  if (breakNeed >= 3) summaries.push({
    category: "break",
    summary: `A break was still needed in ${breakNeed} of your last ${totalCheckins} check-ins.`,
    evidence: evidence(breakNeed),
  });

  for (const strategy of helpfulStrategyValues.filter((value) => value !== "none_yet")) {
    const used = checkins.filter((checkin) => checkin.helpful_strategy === strategy).length;
    if (used >= 3) {
      summaries.push({
        category: "strategy",
        summary: `You chose ${labels[strategy]} in ${used} of your last ${totalCheckins} check-ins.`,
        evidence: evidence(used),
      });
      break;
    }
  }

  return summaries;
}
