import nodemailer from 'nodemailer';

/**
 * Create a reusable SMTP transporter from environment variables.
 * Returns null if SMTP is not configured.
 */
export function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
  });
}

/**
 * Calculate follow-up date: 7-10 business days from now.
 * Picks a random day between 7-10 workdays ahead, skipping weekends.
 * Sets time to 9:00 AM.
 */
export function calculateFollowUpDate(): Date {
  const targetDays = 7 + Math.floor(Math.random() * 4); // 7, 8, 9, or 10
  const date = new Date();
  let workdaysAdded = 0;

  while (workdaysAdded < targetDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      workdaysAdded++;
    }
  }

  date.setHours(9, 0, 0, 0);
  return date;
}

/**
 * Replace placeholders in template text with lead data.
 */
export function personalizeTemplate(
  template: string,
  lead: { companyName: string; vacancyTitle?: string | null; email?: string | null },
): string {
  return template
    .replace(/\{\{bedrijfsnaam\}\}/gi, lead.companyName)
    .replace(/\{\{vacaturetitel\}\}/gi, lead.vacancyTitle || 'uw vacature')
    .replace(/\{\{email\}\}/gi, lead.email || '');
}

/**
 * Convert plain text body to simple HTML paragraphs.
 */
export function textToHtml(body: string): string {
  return body
    .split('\n')
    .map((line: string) =>
      line.trim() === '' ? '<br/>' : `<p style="margin:0 0 4px 0;">${line}</p>`,
    )
    .join('');
}

/**
 * Get the SMTP sender identity from environment variables.
 */
export function getSender() {
  const fromName = process.env.SMTP_FROM_NAME || 'LeadFlow';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  return { fromName, fromEmail };
}
