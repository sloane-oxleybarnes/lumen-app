import { supabaseAdmin } from "./server-admin";

export function isBetaInviteOnly() {
  return process.env.BETA_INVITE_ONLY !== "false";
}

function isInternalTester(email: string) {
  const normalized = email.trim().toLowerCase();
  return (
    normalized === "hello@meetbeckett.co" ||
    /^hello\+[^@]+@meetbeckett\.co$/.test(normalized) ||
    normalized === "hello@meetbeckett.com" ||
    normalized === "gpt+judge+hello@meetbeckett.com"
  );
}

export async function hasApprovedBetaAccess(input: { email?: string | null; plan?: string | null }) {
  if (!isBetaInviteOnly()) return true;

  const email = input.email?.trim().toLowerCase();
  if (!email) return false;
  if (isInternalTester(email)) return true;
  if (input.plan === "beta" || input.plan === "pro" || input.plan === "team") return true;

  const { data } = await supabaseAdmin
    .from("beta_signups")
    .select("approved")
    .eq("email", email)
    .eq("approved", true)
    .maybeSingle();

  return Boolean(data?.approved);
}

export async function ensureApprovedBetaPlan(input: {
  userId: string;
  email?: string | null;
  plan?: string | null;
}) {
  if (input.plan !== "free") return input.plan || "free";

  const email = input.email?.trim().toLowerCase();
  if (!email || isInternalTester(email)) return input.plan;

  const { data: signup } = await supabaseAdmin
    .from("beta_signups")
    .select("approved")
    .eq("email", email)
    .eq("approved", true)
    .maybeSingle();

  if (!signup?.approved) return input.plan;

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ plan: "beta" })
    .eq("id", input.userId);

  return error ? input.plan : "beta";
}
