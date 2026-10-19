/**
 * Create an owner account (and workspace), or reset an existing account's password.
 *
 *   npm run create-admin -- --email you@company.com --name "Your Name" [--workspace "Acme"]
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or generated and printed.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword } from '../auth/crypto.js';
import { db } from '../db/index.js';
import { migrateToLatest } from '../db/migrate.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, workspace: { type: 'string' } }
});
if (!values.email) {
  console.error('Usage: npm run create-admin -- --email you@company.com --name "Your Name" [--workspace "Acme"]');
  process.exit(1);
}

await migrateToLatest(() => {});
const email = values.email.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
const hash = await hashPassword(password);

const existing = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
if (existing) {
  await db.updateTable('users').set({ password_hash: hash, failed_logins: 0, locked_until: null, is_disabled: false }).where('id', '=', existing.id).execute();
  await db.deleteFrom('sessions').where('user_id', '=', existing.id).execute();
  console.log(`Password reset for ${email}.`);
} else {
  await db.transaction().execute(async (trx) => {
    const user = await trx
      .insertInto('users')
      .values({ email, name: values.name || email.split('@')[0], password_hash: hash, last_login_at: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    const ws = await trx
      .insertInto('workspaces')
      .values({ name: values.workspace || 'Solution Velocity' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx.insertInto('memberships').values({ workspace_id: ws.id, user_id: user.id, role: 'owner' }).execute();
  });
  console.log(`Created owner ${email}.`);
}
if (!process.env.ADMIN_PASSWORD) console.log(`Temporary password: ${password}\nChange it after signing in (avatar menu → Change password).`);
await db.destroy();
