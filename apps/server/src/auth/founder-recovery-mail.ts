import nodemailer from 'nodemailer';
import { config } from '../config.js';

/** Internal delivery primitive only: not mounted as a recovery endpoint. */
export async function deliverFounderRecoveryEmail(address: string, token: string): Promise<'sent' | 'unavailable' | 'failed'> {
  const { RESET_SMTP_HOST: host, RESET_SMTP_FROM: from, RESET_SMTP_PORT: port, RESET_SMTP_SECURE: secure, RESET_SMTP_USER: user, RESET_SMTP_PASSWORD: password } = config;
  if (!host || !from || (!!user !== !!password) || !/^[A-Za-z0-9_-]{43}$/.test(token) || (config.isProd && !config.secureCookies)) return 'unavailable';
  const transport = nodemailer.createTransport({ host, port, secure, requireTLS: config.NODE_ENV !== 'test' && !secure, auth: user && password ? { user, pass: password } : undefined, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
  try {
    // The fragment keeps the token out of HTTP request paths and proxy logs.
    const url = `${config.appOrigin}/founders/recovery#${token}`;
    const result = await transport.sendMail({ from, to: address, subject: 'Solution Velocity founder password recovery', text: `A password recovery was requested. This link expires in 20 minutes and can be used once:\n\n${url}\n\nA password reset does not bypass your authenticator. If you did not request this, contact your security administrator.` });
    return result.accepted.length > 0 ? 'sent' : 'failed';
  } catch {
    // Transport errors can contain message text or credentials; do not log them.
    return 'failed';
  } finally { transport.close(); }
}
