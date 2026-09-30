import nodemailer from 'nodemailer';

export function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];
}) {
  const t = createTransport();
  if (!t) {
    console.log('[email] SMTP not configured — dropping mail to', opts.to);
    return false;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
  return true;
}

export function welcomeEmail(name: string) {
  return {
    subject: 'Welcome to StockForge AI',
    html: `<h1>Welcome, ${name || 'creator'}!</h1><p>Your trial credits are ready. Start generating stock metadata in seconds.</p>`,
  };
}
