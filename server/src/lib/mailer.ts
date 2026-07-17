import nodemailer, { Transporter } from "nodemailer";
import { env } from "./env";

// Outgoing email is optional. If no SMTP server is configured the app still runs
// normally — email-dependent flows (like password reset) simply log a warning
// instead of sending. Configure it by setting SMTP_HOST / SMTP_USER / SMTP_PASS
// (see DEPLOYMENT.md → "Password-reset email").

export function mailConfigured(): boolean {
  return Boolean(env.mail.host && env.mail.user && env.mail.pass);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!mailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transporter;
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Sends an email. Returns true if it was actually dispatched, false if email is
// not configured (so callers can decide what to tell the user). Throws only on a
// genuine send failure with configured credentials.
export async function sendMail(mail: Mail): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    console.warn(
      `[mailer] Email not configured — skipping message "${mail.subject}" to ${mail.to}. ` +
        `Set SMTP_HOST/SMTP_USER/SMTP_PASS to enable.`
    );
    return false;
  }
  await tx.sendMail({
    from: env.mail.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return true;
}

// Builds and sends the password-reset email. `resetUrl` is a full link the user
// can click to open the reset page with the token pre-filled.
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const subject = "Reset your Hostel Manager password";
  const text =
    `We received a request to reset your Hostel Manager password.\n\n` +
    `Open this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 8px">Reset your password</h2>
      <p style="color:#475569;margin:0 0 20px">
        We received a request to reset your <strong>Hostel Manager</strong> password.
        Click the button below to choose a new one. This link is valid for 1 hour.
      </p>
      <p style="margin:0 0 24px">
        <a href="${resetUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Set a new password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px">Or copy this link into your browser:</p>
      <p style="color:#4f46e5;font-size:13px;word-break:break-all;margin:0 0 24px">${resetUrl}</p>
      <p style="color:#94a3b8;font-size:12px;margin:0">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
    </div>`;
  return sendMail({ to, subject, text, html });
}
