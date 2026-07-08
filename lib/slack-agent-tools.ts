import type { SlackCoachingIntent } from "@/lib/slack-app";

export type SlackAgentToolName =
  | "analyze_slack_thread"
  | "draft_slack_reply"
  | "coach_for_clarity"
  | "prep_difficult_conversation"
  | "summarize_relationship_context"
  | "explain_tone_without_over_inference";

export type SlackAgentTool = {
  name: SlackAgentToolName;
  description: string;
  outputContract: string;
};

export const SLACK_AGENT_TOOLS: SlackAgentTool[] = [
  {
    name: "analyze_slack_thread",
    description: "Explain what is visible in a Slack message or thread without over-reading ambiguous tone.",
    outputContract: "Return a concise possible read and one useful next step. Fold uncertainty into the possible read instead of making a separate uncertainty section.",
  },
  {
    name: "draft_slack_reply",
    description: "Draft Slack-ready replies that preserve the user's intent and reduce avoidable friction.",
    outputContract: "Return 2-3 options labeled Direct but kind, Warm and collaborative, and Concise when useful.",
  },
  {
    name: "coach_for_clarity",
    description: "Help a user ask for missing information without over-apologizing or sounding defensive.",
    outputContract: "Name the missing context, give a clear question, and remove unnecessary apology language.",
  },
  {
    name: "prep_difficult_conversation",
    description: "Prepare a user for a high-stakes workplace conversation before they have it.",
    outputContract: "Return an opening line, talking points, likely pushback, and a follow-up draft.",
  },
  {
    name: "summarize_relationship_context",
    description: "Summarize only visible communication patterns that matter for this exchange.",
    outputContract: "Use evidence-based wording and avoid claims about rapport, comfort, or intent that are not shown.",
  },
  {
    name: "explain_tone_without_over_inference",
    description: "Explain tone and subtext while protecting the user from over-reading ambiguous Slack messages.",
    outputContract: "Ground the answer in visible facts, give possible interpretations carefully, and keep uncertainty concise inside the main read.",
  },
];

export function selectSlackAgentTool({
  intent,
  hasSlackContext,
  action,
}: {
  intent: SlackCoachingIntent;
  hasSlackContext: boolean;
  action: "slash_command" | "message_shortcut" | "agent_message";
}): SlackAgentToolName {
  if (intent === "prep") return "prep_difficult_conversation";
  if (intent === "draft" || intent === "rewrite" || intent === "followup") return "draft_slack_reply";
  if (intent === "decode" || intent === "tone") return "explain_tone_without_over_inference";
  if (action === "message_shortcut" && hasSlackContext) return "analyze_slack_thread";
  return "coach_for_clarity";
}

export function slackAgentToolInstruction(toolName: SlackAgentToolName) {
  const tool = SLACK_AGENT_TOOLS.find((item) => item.name === toolName);
  if (!tool) return "";

  return [
    `Active Beckett agent tool: ${tool.name}`,
    `Tool purpose: ${tool.description}`,
    `Tool output: ${tool.outputContract}`,
  ].join("\n");
}
