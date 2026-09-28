/**
 * ---------------------------------------------------------------------------
 * Reusable, dependency-free HTML email templates.
 *
 * The reminder goes through `layout()` so branding, spacing and typography stay
 * consistent. The output is table-based with inlined CSS, which is what Outlook
 * and Gmail clients actually render reliably.
 * ---------------------------------------------------------------------------
 */

const BRAND = {
  bg: '#f1f5f9',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  primary: '#4f46e5',
  primaryDark: '#4338ca',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface TestEmailData {
  recipientName: string;
  environment: string;
  /** Resolved host, so the operator can confirm which SMTP server is in use. */
  smtpHost: string;
  captured: boolean;
}

function statusPill(text: string, tone: 'success' | 'warning'): string {
  const colors =
    tone === 'success'
      ? { bg: '#ecfdf5', fg: '#059669' }
      : { bg: '#fffbeb', fg: '#d97706' };
  return `<span style="display:inline-block;background:${colors.bg};color:${colors.fg};
            border-radius:9999px;padding:4px 12px;font-size:12px;font-weight:600;">${escapeHtml(text)}</span>`;
}

/**
 * A diagnostic message the admin can send to themselves to confirm outbound
 * email works. It reports the *resolved* SMTP settings so a misconfiguration is
 * obvious without reading logs.
 */
export function testEmailTemplate(data: TestEmailData): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 18px 0;font-size:15px;line-height:1.65;color:${BRAND.text};">
      Hi ${escapeHtml(data.recipientName)},
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:${BRAND.text};">
      This is a test message from ClassHub, sent so you can confirm that outbound
      email is configured correctly.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
      ${detailRow('Environment', data.environment)}
      ${detailRow('SMTP host', data.smtpHost)}
      ${detailRow('Result', 'Rendered successfully')}
    </table>
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.65;color:${BRAND.text};">
      ${statusPill(
        data.captured ? 'CAPTURED - not sent' : 'SENT over SMTP',
        data.captured ? 'warning' : 'success',
      )}
    </p>
    <p style="margin:0;font-size:14px;line-height:1.65;color:${BRAND.muted};">
      ${
        data.captured
          ? 'SMTP is not configured, so this message was recorded instead of delivered. Set EMAIL_HOST and EMAIL_USER in server/.env to send for real.'
          : 'If you received this message, reminder emails will reach students too.'
      }
    </p>`;

  return {
    subject: 'ClassHub - outbound email test',
    html: layout({
      title: 'Email configuration test',
      eyebrow: 'Diagnostics',
      preheader: 'Confirming that ClassHub can send email',
      bodyHtml: body,
      actionLabel: 'Open ClassHub',
      actionUrl: data.smtpHost.startsWith('http') ? data.smtpHost : 'http://localhost:5173',
    }),
  };
}

export interface ReminderEmailData {
  studentName: string;
  kindLabel: 'Quiz' | 'Assignment';
  title: string;
  lastDateFormatted: string;
  remainingFormatted: string;
  linkUrl: string;
}

function layout(opts: {
  title: string;
  preheader: string;
  eyebrow: string;
  bodyHtml: string;
  actionLabel: string;
  actionUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:${BRAND.bg};">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.card};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:24px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.2px;">ClassHub</td>
              <td align="right" style="font-size:12px;color:#c7d2fe;">${escapeHtml(opts.eyebrow)}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${BRAND.text};font-weight:700;">${escapeHtml(opts.title)}</h1>
          ${opts.bodyHtml}
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;">
          <a href="${escapeHtml(opts.actionUrl)}"
             style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;
                    font-weight:600;font-size:15px;padding:13px 30px;border-radius:8px;">
            ${escapeHtml(opts.actionLabel)}
          </a>
        </td></tr>

        <tr><td style="padding:0 32px 28px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};padding-top:18px;">
            <tr><td style="font-size:12px;line-height:1.6;color:${BRAND.muted};">
              This is an automated message from your ClassHub course portal.
            </td></tr>
          </table>
        </td></tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:11px;color:${BRAND.muted};text-align:center;">
        &copy; ${new Date().getFullYear()} ClassHub &middot; Quiz &amp; Assignment Management
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string, accent = false): string {
  return `
    <tr>
      <td style="padding:9px 0;font-size:13px;color:${BRAND.muted};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;font-size:14px;color:${accent ? '#dc2626' : BRAND.text};font-weight:${accent ? 600 : 500};">${escapeHtml(value)}</td>
    </tr>`;
}

function alert(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px 0;">
    <tr><td style="background:#fffbeb;color:#d97706;border-radius:8px;padding:13px 16px;font-size:13px;line-height:1.55;font-weight:500;">
      ${escapeHtml(text)}
    </td></tr></table>`;
}

/**
 * The pre-last-date reminder.
 *
 * Wording follows the brief closely: greeting, what is coming, the exact last
 * date, how much time is left, and a direct link.
 */
export function deadlineReminderTemplate(data: ReminderEmailData): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 18px 0;font-size:15px;line-height:1.65;color:${BRAND.text};">
      Hi ${escapeHtml(data.studentName)},
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:${BRAND.text};">
      This is a reminder that the last date for your ${data.kindLabel.toLowerCase()}
      <strong>&ldquo;${escapeHtml(data.title)}&rdquo;</strong> is
      ${escapeHtml(data.remainingFormatted === 'no time remaining' ? 'here' : `in about ${data.remainingFormatted}`)}.
    </p>
    ${alert(`Last date: ${data.lastDateFormatted}`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
      ${detailRow('Item', data.title)}
      ${detailRow('Type', data.kindLabel)}
      ${detailRow('Last date', data.lastDateFormatted, true)}
      ${detailRow('Time remaining', data.remainingFormatted, true)}
    </table>
    <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.text};">
      The question and the answer are both available now &mdash; use this as a chance to
      revise before the last date.
    </p>`;

  return {
    subject: `Reminder: ${data.title} - last date ${data.lastDateFormatted}`,
    html: layout({
      title: `${data.kindLabel} last date approaching`,
      eyebrow: 'Deadline Reminder',
      preheader: `${data.title} - last date ${data.lastDateFormatted}`,
      bodyHtml: body,
      actionLabel: `Open ${data.kindLabel}`,
      actionUrl: data.linkUrl,
    }),
  };
}
