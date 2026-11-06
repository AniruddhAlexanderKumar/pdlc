// Restricted bootstrap entry point. Until the MFA/login lifecycle is complete,
// production execution is deliberately disabled: creating an inaccessible owner
// would consume the one-time bootstrap state and lock the owner out.
import { db } from '../db/index.js';
import { bootstrapFounder } from '../auth/founder-bootstrap.js';
import { founderEncryptionKey } from '../auth/founder-mfa.js';
import { consumeFounderBucket, founderRateKey } from '../auth/founder-rate-limit.js';
import { randomUUID } from 'node:crypto';

try {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') throw new Error('disabled');
  if (process.env.SV_FOUNDER_BOOTSTRAP_ENABLED !== 'true') throw new Error('disabled');
  const rateKey = founderEncryptionKey(process.env.SV_FOUNDER_RATE_LIMIT_KEY ?? '');
  const decision = await consumeFounderBucket(db, founderRateKey(rateKey, 'bootstrap', 'bootstrap', 'bootstrap'), { freeAttempts: 4, windowSeconds: 900, firstDelaySeconds: 5, maxDelaySeconds: 300 });
  if (!decision.allowed) {
    await db.insertInto('founder_security_audit').values({ event_type: 'bootstrap_rate_limited', actor_id: null, actor_role: 'system', target_id: null, outcome: 'denied', request_id: randomUUID() }).execute();
    throw new Error('rate limited');
  }
  const result = await bootstrapFounder(db, {
    expectedSecretSha256: process.env.SV_FOUNDER_BOOTSTRAP_SECRET_SHA256 ?? '',
    submittedSecret: process.env.SV_FOUNDER_BOOTSTRAP_SECRET ?? '',
    initialPassword: process.env.SV_FOUNDER_BOOTSTRAP_PASSWORD ?? '',
    name: process.env.SV_FOUNDER_BOOTSTRAP_NAME ?? ''
  });
  if (result !== 'created') {
    console.error('Founder bootstrap denied.');
    process.exitCode = 1;
  } else {
    console.log('Pending founder created. Authentication remains unavailable.');
  }
} catch {
  // Never print the exception: drivers can include sensitive database row values.
  console.error('Founder bootstrap unavailable or failed.');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
