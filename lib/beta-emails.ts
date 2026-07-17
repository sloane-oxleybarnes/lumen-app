import { Resend } from "resend";
import { supabaseAdmin } from "./server-admin";

const FROM_EMAIL = "Beckett <hello@meetbeckett.co>";
const REPLY_TO_EMAIL = "hello@meetbeckett.co";

type EmailButton = {
  label: string;
  href: string;
};

type BrandedEmail = {
  to: string;
  subject: string;
  preview: string;
  eyebrow?: string;
  heading: string;
  body: string[];
  button?: EmailButton;
  secondary?: string;
};

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderText(email: BrandedEmail) {
  return [
    email.heading,
    "",
    ...email.body,
    email.button ? ["", `${email.button.label}: ${email.button.href}`].join("\n") : "",
    email.secondary ? ["", email.secondary].join("\n") : "",
    "",
    "Questions? Reply to this email and it will go to the Beckett team.",
    "",
    "Beckett",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderHtml(email: BrandedEmail) {
  const paragraphs = email.body
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#3f3a33;font-size:16px;line-height:1.6;">${escapeHtml(paragraph)}</p>`
    )
    .join("");

  const button = email.button
    ? `<a href="${escapeHtml(email.button.href)}" style="display:inline-block;background:#BA7517;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 20px;font-size:15px;font-weight:700;margin:8px 0 20px;">${escapeHtml(email.button.label)}</a>`
    : "";

  const secondary = email.secondary
    ? `<p style="margin:4px 0 0;color:#6f6961;font-size:13px;line-height:1.5;">${escapeHtml(email.secondary)}</p>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(email.subject)}</title>
  </head>
  <body style="margin:0;background:#FBF8F3;font-family:Arial,Helvetica,sans-serif;color:#1A1917;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(email.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7dfd2;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 10px;color:#BA7517;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">${escapeHtml(email.eyebrow || "Beckett beta")}</p>
                <h1 style="margin:0;color:#1A1917;font-family:Georgia,serif;font-size:30px;line-height:1.15;font-weight:400;">${escapeHtml(email.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;">
                ${paragraphs}
                ${button}
                ${secondary}
                <div style="border-top:1px solid #eee7dc;margin-top:24px;padding-top:18px;">
                  <p style="margin:0;color:#8A8784;font-size:13px;line-height:1.5;">Questions? Reply to this email and it will go to the Beckett team.</p>
                  <p style="margin:12px 0 0;color:#8A8784;font-size:13px;">Beckett</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendBrandedEmail(email: BrandedEmail) {
  const resend = getResend();
  if (!resend) return false;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email.to,
    subject: email.subject,
    html: renderHtml(email),
    text: renderText(email),
    replyTo: REPLY_TO_EMAIL,
  });

  return true;
}

export async function sendBetaSignupConfirmation(params: {
  email: string;
  name?: string | null;
}) {
  return sendBrandedEmail({
    to: params.email,
    subject: "We received your Beckett beta request",
    preview: "Thanks for asking to try Beckett. We will review your request and follow up soon.",
    heading: "Thanks for asking to try Beckett.",
    body: [
      `Hi${params.name ? ` ${params.name.split(" ")[0]}` : ""} - we received your beta request.`,
      "Beckett is currently a small workplace-focused beta for people who want communication coaching in Gmail, Slack, Chrome, practice sessions, and skills.",
      "We are reviewing requests manually so the first group stays small and useful. If approved, you will get a setup email with a secure link to create your password.",
    ],
  });
}

export async function sendBetaSignupNotification(params: {
  email: string;
  name?: string | null;
  source?: string | null;
}) {
  return sendBrandedEmail({
    to: REPLY_TO_EMAIL,
    subject: "New Beckett beta request",
    preview: "A new person requested Beckett beta access.",
    eyebrow: "Beta operations",
    heading: "New beta request",
    body: [
      `Name: ${params.name?.trim() || "Not provided"}`,
      `Email: ${params.email}`,
      `Source: ${params.source?.trim() || "landing_page"}`,
      "Review this request in Beckett Admin before sending an invitation.",
    ],
    button: {
      label: "Review beta requests",
      href: "https://www.meetbeckett.co/admin#beta-testers",
    },
  });
}

export async function sendBetaInviteEmail(params: {
  email: string;
  name?: string | null;
  actionLink: string;
}) {
  return sendBrandedEmail({
    to: params.email,
    subject: "You are approved for the Beckett beta",
    preview: "Create your Beckett password and start setting up your communication coach.",
    heading: "Your Beckett beta access is ready.",
    body: [
      `Hi${params.name ? ` ${params.name.split(" ")[0]}` : ""} - you have been approved for the Beckett beta.`,
      "Beckett is your workplace communication coach. It can help you practice conversations, understand confusing messages, draft replies, and build communication skills.",
      "Use the button below to create your password. After that, Beckett will walk you through setup and ask a few coaching-profile questions so it can support you more personally.",
    ],
    button: {
      label: "Set up Beckett",
      href: params.actionLink,
    },
    secondary: "This secure setup link can expire. If it does, reply here and we can send a fresh one.",
  });
}

export async function sendBetaInviteReminderEmail(params: {
  email: string;
  name?: string | null;
  actionLink: string;
}) {
  return sendBrandedEmail({
    to: params.email,
    subject: "Reminder: your Beckett beta setup link",
    preview: "Your Beckett beta spot is ready when you are.",
    heading: "Your Beckett beta spot is still ready.",
    body: [
      `Hi${params.name ? ` ${params.name.split(" ")[0]}` : ""} - quick reminder that your Beckett beta access is approved.`,
      "If you still want to try it, use the setup link below to create your password and start onboarding.",
      "If now is not a good time, no action is needed.",
    ],
    button: {
      label: "Set up Beckett",
      href: params.actionLink,
    },
    secondary: "This is the only automatic setup reminder we will send for this invite.",
  });
}

export async function sendSetupNudgeEmail(params: {
  email: string;
  name?: string | null;
  dashboardUrl: string;
}) {
  return sendBrandedEmail({
    to: params.email,
    subject: "A quick next step for Beckett",
    preview: "Connect the extension, Gmail, or Slack so Beckett can coach with real context.",
    heading: "Want Beckett to be more useful?",
    body: [
      `Hi${params.name ? ` ${params.name.split(" ")[0]}` : ""} - you have started setting up Beckett.`,
      "The next useful step is connecting the Chrome extension, Gmail, or Slack. That lets Beckett coach around real workplace communication instead of generic examples.",
      "You can also skip anything you are not ready to connect yet.",
    ],
    button: {
      label: "Continue setup",
      href: params.dashboardUrl,
    },
  });
}

export async function sendFeedbackThankYouIfFirst(params: {
  email?: string | null;
  userId?: string | null;
}) {
  if (!params.email) return false;

  const { data: existing } = await supabaseAdmin
    .from("beta_events")
    .select("id")
    .eq("email", params.email.toLowerCase())
    .eq("event_name", "feedback_thank_you_sent")
    .limit(1)
    .maybeSingle();

  if (existing) return false;

  const sent = await sendBrandedEmail({
    to: params.email,
    subject: "Thanks for helping shape Beckett",
    preview: "Your feedback helps make Beckett clearer, safer, and more useful for beta users.",
    heading: "Thank you for the feedback.",
    body: [
      "Real beta feedback is how Beckett gets better. Your note helps us understand what felt useful, confusing, broken, or worth changing.",
      "We read beta feedback carefully and use it to decide what needs to change before inviting more people.",
    ],
  });

  if (sent) {
    await supabaseAdmin.from("beta_events").insert({
      user_id: params.userId || null,
      email: params.email.toLowerCase(),
      event_name: "feedback_thank_you_sent",
      source: "email",
      metadata: {},
    });
  }

  return sent;
}
