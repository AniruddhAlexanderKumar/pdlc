import { hashToken, newToken } from '../auth/crypto.js';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { mailConfigured, sendTransactionalMail, type MailResult } from '../lib/mailer.js';

/**
 * Email verification for new accounts.
 *
 * Policy: a token is issued and mailed on registration *whenever SMTP is
 * configured*, and email verification is only enforced when the operator asks
 * for it (`REQUIRE_EMAIL_VERIFICATION=true`). Without an SMTP transport there
 * is nothing to send and no way for a user to complete verification, so
 * enforcing it would permanently lock them out of the workspace they just
 * created. The enforcement decision is therefore made against
 * `mailConfigured()`, not just the environment flag, and is reported honestly
 * through `/api/auth/config` so the UI never promises an email that cannot
 * arrive.
 */

const VERIFICATION_HOURS = 24;

export function emailVerificationEnforced(): boolean {
  return config.REQUIRE_EMAIL_VERIFICATION === true && mailConfigured();
}

export interface IssuedVerification {
  token: string;
  expiresInHours: number;
}

/** Creates a fresh single-use verification token, replacing any outstanding ones. */
export async function issueEmailVerification(db: Db, userId: string): Promise<IssuedVerification> {
  const { token, hash } = newToken();
  await db.deleteFrom('email_verifications').where('user_id', '=', userId).where('used_at', 'is', null).execute();
  await db
    .insertInto('email_verifications')
    .values({ user_id: userId, token_hash: hash, expires_at: new Date(Date.now() + VERIFICATION_HOURS * 3600_000) })
    .execute();
  return { token, expiresInHours: VERIFICATION_HOURS };
}

export function verificationText(name: string, token: string): string {
  const url = `${config.appOrigin}/verify-email#${token}`;
  return [
    `Hello ${name},`,
    '',
    'Confirm the email address for your Solution Velocity account by opening this link:',
    '',
    url,
    '',
    `The link can be used once and expires in ${VERIFICATION_HOURS} hours.`,
    'If you did not create a Solution Velocity account, you can ignore this message.',
    '',
    'Solution Velocity'
  ].join('\n');
}

/** Mails an already-issued token. Kept separate so the token can be written inside a transaction. */
export async function deliverVerificationEmail(address: string, name: string, token: string): Promise<MailResult> {
  return sendTransactionalMail(address, 'Confirm your Solution Velocity email address', verificationText(name, token));
}

/** Issues a token and mails it. Returns the delivery result so callers can react. */
export async function sendEmailVerification(db: Db, user: { id: string; email: string; name: string }): Promise<{ mail: MailResult; enforcement: boolean }> {
  if (!mailConfigured()) return { mail: 'unavailable', enforcement: emailVerificationEnforced() };
  const { token } = await issueEmailVerification(db, user.id);
  const mail = await sendTransactionalMail(user.email, 'Confirm your Solution Velocity email address', verificationText(user.name, token));
  if (mail !== 'sent') {
    // Never keep a token the user cannot receive.
    await db.deleteFrom('email_verifications').where('user_id', '=', user.id).where('used_at', 'is', null).execute();
  }
  return { mail, enforcement: emailVerificationEnforced() };
}

export interface ConsumedVerification {
  userId: string;
}

/** Redeems a verification token exactly once. Throws an HttpError-compatible result via null. */
export async function redeemEmailVerification(db: Db, token: string): Promise<ConsumedVerification | null> {
  const hash = hashToken(token);
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('email_verifications')
      .select(['id', 'user_id'])
      .where('token_hash', '=', hash)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date())
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    const marked = await trx
      .updateTable('email_verifications')
      .set({ used_at: new Date() })
      .where('id', '=', row.id)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    if (Number(marked.numUpdatedRows) !== 1) return null;
    await trx.updateTable('users').set({ email_verified_at: new Date() }).where('id', '=', row.user_id).execute();
    return { userId: row.user_id };
  });
}
