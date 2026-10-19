import { db } from '../db/index.js';
import { migrateToLatest } from '../db/migrate.js';

await migrateToLatest();
await db.destroy();
console.log('Database is up to date.');
