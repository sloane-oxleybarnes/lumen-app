export type SiteContentField = {
  key: string;
  label: string;
  group: string;
  defaultValue: string;
  inputType?: "text" | "textarea" | "url";
};

export const SITE_CONTENT_FIELDS = [
  {
    key: "home.hero.badge",
    label: "Homepage hero badge",
    group: "Homepage",
    defaultValue: "Beta - Everything included - No credit card",
  },
  {
    key: "home.hero.title",
    label: "Homepage headline",
    group: "Homepage",
    defaultValue:
      "A communication coach built\nfor neurodivergent workdays.",
    inputType: "textarea",
  },
  {
    key: "home.hero.subtitle",
    label: "Homepage subheadline",
    group: "Homepage",
    defaultValue:
      "Beckett helps you decode tone, draft clearer replies, and practice the conversations that get harder when work runs on subtext.",
    inputType: "textarea",
  },
  {
    key: "home.hero.cta",
    label: "Homepage CTA",
    group: "Homepage",
    defaultValue: "Join the beta - it's free",
  },
  {
    key: "home.beta.label",
    label: "Homepage beta label",
    group: "Homepage beta",
    defaultValue: "Beta access",
  },
  {
    key: "home.beta.title",
    label: "Homepage beta headline",
    group: "Homepage beta",
    defaultValue: "Help shape Beckett\nfor neurodivergent adults.",
    inputType: "textarea",
  },
  {
    key: "home.beta.subtitle",
    label: "Homepage beta subheadline",
    group: "Homepage beta",
    defaultValue:
      "Every feature. No credit card. No paywalls. Just full access while we build together.",
    inputType: "textarea",
  },
  {
    key: "home.beta.button",
    label: "Homepage beta button",
    group: "Homepage beta",
    defaultValue: "Request access",
  },
  {
    key: "home.beta.note",
    label: "Homepage beta note",
    group: "Homepage beta",
    defaultValue: "No credit card required. Full access during beta.",
  },
  {
    key: "beta.hero.badge",
    label: "Beta page badge",
    group: "Beta page",
    defaultValue: "Beta spots open",
  },
  {
    key: "beta.hero.title",
    label: "Beta page headline",
    group: "Beta page",
    defaultValue: "Help build the coach we needed sooner",
  },
  {
    key: "beta.hero.subtitle",
    label: "Beta page subheadline",
    group: "Beta page",
    defaultValue:
      "We're building Beckett with a small group of neurodivergent adults who want clearer support for workplace communication in Gmail, Slack, practice, and skill modules. Beta access is free - no credit card, no commitment.",
    inputType: "textarea",
  },
  {
    key: "beta.form.button",
    label: "Beta page button",
    group: "Beta page",
    defaultValue: "Request beta access",
  },
  {
    key: "features.hero.title",
    label: "Features page headline",
    group: "Features page",
    defaultValue: "Tools for the parts other apps miss",
  },
  {
    key: "features.hero.subtitle",
    label: "Features page subheadline",
    group: "Features page",
    defaultValue:
      "Decode messages, draft replies, practice difficult conversations, and build repeatable skills with coaching designed around neurodivergent communication.",
    inputType: "textarea",
  },
  {
    key: "features.cta.copy",
    label: "Features CTA copy",
    group: "Features page",
    defaultValue: "Want all of it? Join the beta for full Pro access, free.",
    inputType: "textarea",
  },
  {
    key: "features.cta.button",
    label: "Features CTA button",
    group: "Features page",
    defaultValue: "Join the beta",
  },
  {
    key: "integrations.hero.title",
    label: "Integrations page headline",
    group: "Integrations page",
    defaultValue: "Support where work gets ambiguous",
  },
  {
    key: "integrations.hero.subtitle",
    label: "Integrations page subheadline",
    group: "Integrations page",
    defaultValue:
      "Beckett brings neurodivergent-aware coaching into Gmail, Slack, and Chrome for beta, with meeting tools planned after the core flows are stable.",
    inputType: "textarea",
  },
  {
    key: "integrations.cta.copy",
    label: "Integrations CTA copy",
    group: "Integrations page",
    defaultValue: "Want to request an integration? Let us know when you join the beta.",
    inputType: "textarea",
  },
  {
    key: "integrations.cta.button",
    label: "Integrations CTA button",
    group: "Integrations page",
    defaultValue: "Join the beta",
  },
  {
    key: "pricing.hero.title",
    label: "Pricing page headline",
    group: "Pricing page",
    defaultValue: "Beta access for the people we are building with",
  },
  {
    key: "pricing.hero.subtitle",
    label: "Pricing page subheadline",
    group: "Pricing page",
    defaultValue:
      "Beckett is free during beta for early users helping us shape neurodivergent communication coaching. No credit card, no pricing tiers, and no surprise checkout.",
    inputType: "textarea",
  },
  {
    key: "pricing.footer.note",
    label: "Pricing footer note",
    group: "Pricing page",
    defaultValue: "Beta access is free while we build with early users.",
    inputType: "textarea",
  },
  {
    key: "extension.chrome_store_url",
    label: "Chrome Web Store URL",
    group: "Links",
    defaultValue: "",
    inputType: "url",
  },
] satisfies SiteContentField[];

export const SITE_CONTENT_DEFAULTS = SITE_CONTENT_FIELDS.reduce<Record<string, string>>(
  (acc, field) => {
    acc[field.key] = field.defaultValue;
    return acc;
  },
  {},
);

export function contentValue(content: Record<string, string>, key: string) {
  return content[key] ?? SITE_CONTENT_DEFAULTS[key] ?? "";
}
