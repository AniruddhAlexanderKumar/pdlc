// Non-production local worker for the logging regression only.
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'development' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_logging12_test') throw Error('Unsafe test environment');
const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
const server = createApp().listen(Number(process.env.FOUNDER_FIXTURE_PORT), '127.0.0.1', () => console.log('FOUNDER_FIXTURE_READY'));
process.on('SIGTERM', () => server.close(async () => { await db.destroy(); process.exit(0); }));
