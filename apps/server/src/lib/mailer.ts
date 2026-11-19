import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * Transactional mail for account flows (email verification, password reset).
 *
 * Reuses the operator's existing RESET_SMTP_* configuration — the same
 * transport the workspace "send a reset link" action already uses — so no new
 * secrets or provider accounts are required. When SMTP is not configured the
 * result is `unavailable`: callers must treat that as "the mail was not sent"
 * and decide, per flow, whether the account can still proceed (see
 * `apps/server/src/services/account-mail.ts`).
 *
 * Only the recipient address and a freshly generated, hashed-elsewhere token
 * are ever passed in. Nothing here logs a token or a message body.
 */

export type MailResult = 'sent' | 'unavailable' | 'failed';

export function mailConfigured(): boolean {
  const { RESET_SMTP_HOST: host, RESET_SMTP_FROM: from, RESET_SMTP_USER: user, RESET_SMTP_PASSWORD: pass } = config;
  return Boolean(host && from && !!user === !!pass);
}

export async function sendTransactionalMail(to: string, subject: string, text: string): Promise<MailResult> {
  if (!mailConfigured()) return 'unavailable';
  const { RESET_SMTP_HOST: host, RESET_SMTP_FROM: from, RESET_SMTP_PORT: port, RESET_SMTP_SECURE: secure, RESET_SMTP_USER: user, RESET_SMTP_PASSWORD: pass } = config;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: config.NODE_ENV !== 'test' && !secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });
  try {
    const delivery = await transport.sendMail({ from, to, subject, text });
    return delivery.accepted.length ? 'sent' : 'failed';
  } catch {
    return 'failed';
  } finally {
    transport.close();
  }
}
