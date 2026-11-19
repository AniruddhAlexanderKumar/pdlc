import { newToken } from '../auth/crypto.js';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { mailConfigured, sendTransactionalMail } from '../lib/mailer.js';

/**
 * Account recovery: "forgot password".
 *
 * Uses the existing `password_resets` table and the existing `/reset` flow, so
 * reset tokens stay single-use, hashed at rest, expiring and session-revoking.
 * The route that calls this always answers the same way whether or not the
 * address exists, so it cannot be used to enumerate accounts.
 */

const RESET_HOURS = 2;

export function recoveryConfigured(): boolean {
  return mailConfigured();
}

/**
 * Issues a reset token and mails it. Returns false when the mail could not be
 * sent, but callers must not surface that difference to the requester.
 */
export async function sendPasswordReset(db: Db, user: { id: string; email: string; name: string }): Promise<boolean> {
  if (!mailConfigured()) return false;
  const { token, hash } = newToken();
  // Supersede outstanding links: one live reset token per account.
  await db
    .updateTable('password_resets')
    .set({ used_at: new Date() })
    .where('user_id', '=', user.id)
    .where('used_at', 'is', null)
    .execute();
  await db
    .insertInto('password_resets')
    .values({ user_id: user.id, token_hash: hash, expires_at: new Date(Date.now() + RESET_HOURS * 3600_000) })
    .execute();
  const url = `${config.appOrigin}/reset#${token}`;
  const text = [
    `Hello ${user.name},`,
    '',
    'A password reset was requested for your Solution Velocity account. Open this link to choose a new password:',
    '',
    url,
    '',
    `The link can be used once and expires in ${RESET_HOURS} hours. All other signed-in devices are signed out when the password changes.`,
    'If you did not request this, you can ignore this message; your password will not change.',
    '',
    'Solution Velocity'
  ].join('\n');
  const result = await sendTransactionalMail(user.email, 'Reset your Solution Velocity password', text);
  if (result !== 'sent') {
    await db.deleteFrom('password_resets').where('token_hash', '=', hash).where('used_at', 'is', null).execute();
    return false;
  }
  return true;
}
