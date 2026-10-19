import "server-only";

import { appendFileSync } from "node:fs";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | undefined;

/**
 * Sends through the cPanel mailbox (SMTP_* settings). Without SMTP, development prints the email to
 * the terminal, and tests write it to MAIL_OUTBOX_FILE.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = serverEnv();
  if (env.smtp) {
    transport ??= nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
    await transport.sendMail({ from: env.smtp.from, ...mail });
    return;
  }
  if (env.mailOutboxFile) {
    appendFileSync(env.mailOutboxFile, JSON.stringify(mail) + "\n");
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n--- Email to ${mail.to} (SMTP not set up, so it's printed here) ---\nSubject: ${mail.subject}\n\n${mail.text}\n---\n`);
    return;
  }
  throw new Error("Email isn't set up (SMTP_HOST).");
}

/** Whether "Forgot password" can actually deliver a link. */
export function canSendMail(): boolean {
  const env = serverEnv();
  return !!env.smtp || !!env.mailOutboxFile || process.env.NODE_ENV !== "production";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function passwordResetMail(input: { to: string; name: string; link: string; minutes: number }): Mail {
  const text = `Hi ${input.name},

Someone (hopefully you) asked to reset your Reorder Console password.

Choose a new password here (the link works once, for ${input.minutes} minutes):
${input.link}

If you didn't ask for this, ignore this email; your password stays the same.

AMIPI Reorder Console`;
  const html = `<div style="font:15px/1.5 Helvetica,Arial,sans-serif;color:#1f2937;max-width:520px">
<p>Hi ${esc(input.name)},</p>
<p>Someone (hopefully you) asked to reset your Reorder Console password.</p>
<p><a href="${esc(input.link)}" style="display:inline-block;background:#1e2a44;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p>
<p style="color:#6b7280;font-size:13px">The link works once, for ${input.minutes} minutes. If you didn't ask for this, ignore this email; your password stays the same.</p>
<p style="color:#6b7280;font-size:13px">AMIPI Reorder Console</p></div>`;
  return { to: input.to, subject: "Reset your Reorder Console password", text, html };
}
