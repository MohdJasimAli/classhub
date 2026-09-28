import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { deadlineReminderTemplate, testEmailTemplate } from './templates.js';

/**
 * ---------------------------------------------------------------------------
 * Email service
 *
 * Transport strategy:
 *  - SMTP configured  -> real delivery via Nodemailer.
 *  - SMTP not configured -> a capture transport. Messages are still rendered
 *    and recorded (EmailLog + console) so the reminder pipeline is fully
 *    verifiable in development and in tests without real credentials.
 *
 * Every send is persisted to `EmailLog`, giving an audit trail of exactly who
 * was told what and whether it succeeded.
 * ---------------------------------------------------------------------------
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (env.emailEnabled) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD },
      pool: true,
      maxConnections: 5,
    });
     
    console.log(`[email] SMTP transport enabled (${env.EMAIL_HOST}:${env.EMAIL_PORT})`);
  } else {
    // `jsonTransport` renders the message without opening a socket.
    transporter = nodemailer.createTransport({ jsonTransport: true });
     
    console.log(
      '[email] SMTP not configured - running in CAPTURE mode. Emails are logged, not sent.',
    );
  }
  return transporter;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SendParams {
  to: string;
  toUserId?: string | null;
  subject: string;
  html: string;
  template: string;
}

/** Low-level send. Persists an EmailLog row for every attempt. */
export async function sendMail(params: SendParams): Promise<SendResult> {
  const { to, toUserId, subject, html, template } = params;

  try {
    const info = await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (!env.emailEnabled) {
       
      console.log(`[email:capture] to=${to} subject="${subject}" template=${template}`);
    }

    const { prisma } = await import('../../config/prisma.js');
    await prisma.emailLog
      .create({
        data: {
          toEmail: to,
          toUserId: toUserId ?? null,
          subject,
          template,
          status: 'SENT',
        },
      })
      .catch(() => undefined);

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
     
    console.error(`[email] failed to send "${subject}" to ${to}: ${message}`);

    const { prisma } = await import('../../config/prisma.js');
    await prisma.emailLog
      .create({
        data: {
          toEmail: to,
          toUserId: toUserId ?? null,
          subject,
          template,
          status: 'FAILED',
          error: message,
        },
      })
      .catch(() => undefined);

    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// The senders this app needs.
// ---------------------------------------------------------------------------

/**
 * Describes the resolved SMTP configuration, so an admin can see exactly which
 * server would be used. Reported by the test-email endpoint.
 */
export function describeTransport() {
  return {
    mode: (env.emailEnabled ? 'SMTP' : 'CAPTURE') as 'SMTP' | 'CAPTURE',
    delivered: env.emailEnabled,
    host: env.emailEnabled ? env.EMAIL_HOST : '(not configured)',
    port: env.emailEnabled ? env.EMAIL_PORT : null,
    secure: env.emailEnabled ? env.EMAIL_SECURE : null,
    user: env.emailEnabled ? maskEmail(env.EMAIL_USER) : null,
    from: env.EMAIL_FROM,
  };
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export const emailService = {
  sendDeadlineReminder(data: {
    to: string;
    userId: string;
    studentName: string;
    kindLabel: 'Quiz' | 'Assignment';
    title: string;
    lastDateFormatted: string;
    remainingFormatted: string;
    linkUrl: string;
  }): Promise<SendResult> {
    const { subject, html } = deadlineReminderTemplate(data);
    return sendMail({
      to: data.to,
      toUserId: data.userId,
      subject,
      html,
      template: 'DEADLINE_REMINDER',
    });
  },

  /**
   * Sends a diagnostic message to the signed-in admin so they can confirm
   * outbound delivery without waiting for a 24-hour reminder.
   */
  sendTestEmail(data: {
    to: string;
    userId: string;
    recipientName: string;
  }): Promise<SendResult> {
    const { subject, html } = testEmailTemplate({
      recipientName: data.recipientName,
      environment: env.NODE_ENV,
      smtpHost: env.emailEnabled ? `${env.EMAIL_HOST}:${env.EMAIL_PORT}` : '(not configured)',
      captured: !env.emailEnabled,
    });

    return sendMail({
      to: data.to,
      toUserId: data.userId,
      subject,
      html,
      template: 'TEST_EMAIL',
    });
  },
};

export type EmailService = typeof emailService;
