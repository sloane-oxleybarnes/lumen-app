export type ContactIdentifierPlatform =
  | "email"
  | "work_email"
  | "personal_email"
  | "slack"
  | "slack_user_id"
  | "phone"
  | "mobile";

export type ContactIdentifierInput = {
  platform?: string | null;
  identifier?: string | null;
  label?: string | null;
  confirmed?: boolean | null;
};

export type NormalizedContactIdentifier = {
  platform: ContactIdentifierPlatform;
  identifier: string;
  label: string | null;
  confirmed: boolean;
};

const supportedPlatforms = new Set<string>([
  "email",
  "work_email",
  "personal_email",
  "slack",
  "slack_user_id",
  "phone",
  "mobile",
]);

export function isContactIdentifierPlatform(platform: string): platform is ContactIdentifierPlatform {
  return supportedPlatforms.has(platform);
}

export function normalizeContactIdentifierPlatform(platform: string | null | undefined) {
  const normalized = String(platform || "").trim().toLowerCase();
  if (normalized === "slack_id" || normalized === "slack_user") return "slack_user_id";
  if (normalized === "slack_handle") return "slack";
  if (normalized === "work") return "work_email";
  if (normalized === "personal") return "personal_email";
  return isContactIdentifierPlatform(normalized) ? normalized : null;
}

function normalizePhoneIdentifier(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasLeadingPlus ? `+${digits}` : digits;
}

export function normalizeContactIdentifier(
  input: ContactIdentifierInput
): NormalizedContactIdentifier | null {
  const platform = normalizeContactIdentifierPlatform(input.platform);
  const rawIdentifier = String(input.identifier || "").trim();
  if (!platform || !rawIdentifier) return null;

  let identifier = rawIdentifier;
  if (platform === "email" || platform === "work_email" || platform === "personal_email") {
    identifier = rawIdentifier.toLowerCase();
  } else if (platform === "slack") {
    identifier = rawIdentifier.replace(/^@/, "").trim().toLowerCase();
  } else if (platform === "slack_user_id") {
    const [teamId, userId] = rawIdentifier.split(":").map((part) => part.trim().toUpperCase());
    if (!teamId || !userId) return null;
    identifier = `${teamId}:${userId}`;
  } else if (platform === "phone" || platform === "mobile") {
    identifier = normalizePhoneIdentifier(rawIdentifier);
  }

  if (!identifier) return null;

  return {
    platform,
    identifier,
    label: input.label?.trim() || null,
    confirmed: input.confirmed ?? platform !== "slack",
  };
}

export function slackUserIdentifier(teamId: string | null | undefined, slackUserId: string | null | undefined) {
  return normalizeContactIdentifier({
    platform: "slack_user_id",
    identifier: `${teamId || ""}:${slackUserId || ""}`,
    confirmed: true,
  });
}

export function buildContactIdentifierRows({
  contactId,
  userId,
  email,
  slackHandle,
  phoneNumber,
  identifiers = [],
}: {
  contactId: string;
  userId: string;
  email?: string | null;
  slackHandle?: string | null;
  phoneNumber?: string | null;
  identifiers?: ContactIdentifierInput[];
}) {
  const normalized = [
    normalizeContactIdentifier({ platform: "email", identifier: email, label: "Email", confirmed: true }),
    normalizeContactIdentifier({
      platform: "slack",
      identifier: slackHandle,
      label: "Slack handle",
      confirmed: false,
    }),
    normalizeContactIdentifier({ platform: "phone", identifier: phoneNumber, label: "Phone", confirmed: true }),
    ...identifiers.map(normalizeContactIdentifier),
  ].filter(Boolean) as NormalizedContactIdentifier[];

  const seen = new Set<string>();
  return normalized
    .filter((item) => {
      const key = `${item.platform}:${item.identifier}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      contact_id: contactId,
      user_id: userId,
      platform: item.platform,
      identifier: item.identifier,
      label: item.label,
      confirmed: item.confirmed,
    }));
}

export function legacyPlatformsFromPatch(body: {
  email?: unknown;
  slack_handle?: unknown;
  phone_number?: unknown;
}) {
  const platforms: ContactIdentifierPlatform[] = [];
  if (body.email !== undefined) platforms.push("email");
  if (body.slack_handle !== undefined) platforms.push("slack");
  if (body.phone_number !== undefined) platforms.push("phone");
  return platforms;
}
