import { sendEmail } from "@/server/email/sender";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}) {
  const safeUrl = escapeHtml(input.resetUrl);
  return sendEmail({
    to: input.to,
    subject: "Reset your IronGraph password",
    devLink: input.resetUrl,
    text: [
      "Reset your IronGraph password",
      "",
      "Use this link within 1 hour:",
      input.resetUrl,
      "",
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: [
      "<h1>Reset your IronGraph password</h1>",
      "<p>Use this link within 1 hour:</p>",
      `<p><a href="${safeUrl}">Reset password</a></p>`,
      "<p>If you did not request this, ignore this email.</p>",
    ].join(""),
  });
}

export async function sendEmailVerificationEmail(input: {
  to: string;
  verifyUrl: string;
}) {
  const safeUrl = escapeHtml(input.verifyUrl);
  return sendEmail({
    to: input.to,
    subject: "Verify your IronGraph email",
    devLink: input.verifyUrl,
    text: [
      "Verify your IronGraph email",
      "",
      "Use this link within 1 hour:",
      input.verifyUrl,
      "",
      "If you did not create an account, ignore this email.",
    ].join("\n"),
    html: [
      "<h1>Verify your IronGraph email</h1>",
      "<p>Use this link within 1 hour:</p>",
      `<p><a href="${safeUrl}">Verify email</a></p>`,
      "<p>If you did not create an account, ignore this email.</p>",
    ].join(""),
  });
}
