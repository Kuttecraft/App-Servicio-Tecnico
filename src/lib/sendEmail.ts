// src/lib/sendEmail.ts
import nodemailer from 'nodemailer';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
} from '../env.server'; // 👈 nuevo import

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host   = SMTP_HOST;
  const port   = SMTP_PORT ? Number(SMTP_PORT) : 465;
  const secure = String(SMTP_SECURE || 'true') === 'true';
  const user   = SMTP_USER;
  const pass   = SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('[EMAIL] Config SMTP incompleta', {
      host, user, hasPass: !!pass,
    });
    throw new Error('Config SMTP incompleta');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  fromName?: string;
}) {
  const { to, subject, text, fromName } = opts;

  const fromEmail   = SMTP_USER || 'kuttercraft@gmail.com';
  const displayName = fromName?.trim() || 'Servicio Técnico';

  if (!to || !to.includes('@')) {
    console.warn('[EMAIL] Abortado: "to" inválido:', to);
    throw new Error('Destino inválido');
  }
  if (!subject?.trim()) {
    console.warn('[EMAIL] Abortado: subject vacío');
    throw new Error('Asunto vacío');
  }
  if (!text?.trim()) {
    console.warn('[EMAIL] Abortado: body vacío');
    throw new Error('Cuerpo vacío');
  }

  console.log('[EMAIL] Preparando envío con transporter', {
    host: SMTP_HOST,
    user: SMTP_USER,
    to,
    subject,
  });

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"${displayName}" <${fromEmail}>`,
    to,
    subject,
    text,
  });

  console.log('[EMAIL] Envío OK', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  });

  return info;
}
