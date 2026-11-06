// Invoked only by founder-rate-limit-smoke against a disposable DB.
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_rate_test' || !/^[a-f0-9]{64}$/.test(process.env.FOUNDER_TEST_BUCKET ?? '')) throw Error('Unsafe test environment');
const { db } = await import('../src/db/index.js');
const { consumeFounderBucket } = await import('../src/auth/founder-rate-limit.js');
try {
  const results = await Promise.all(Array.from({ length: 15 }, () => consumeFounderBucket(db, process.env.FOUNDER_TEST_BUCKET!, { freeAttempts: 10, windowSeconds: 900, firstDelaySeconds: 5, maxDelaySeconds: 300 })));
  console.log(results.filter((r) => r.allowed).length);
} finally { await db.destroy(); }
