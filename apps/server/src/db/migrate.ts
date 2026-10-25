import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { db } from './index.js';
import * as m001 from './migrations/001_init.js';
import * as m002 from './migrations/002_dashboard_layout.js';

/**
 * Migrations are imported statically so they are bundled into the production build.
 * To add one: create migrations/NNN_name.ts and register it here. Never edit a migration
 * that has already run in production.
 */
const migrations: Record<string, Migration> = {
  '001_init': m001,
  '002_dashboard_layout': m002
};

const provider: MigrationProvider = { getMigrations: async () => migrations };

export async function migrateToLatest(log: (msg: string) => void = console.log): Promise<void> {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Success') log(`migration ${r.migrationName} applied`);
    else if (r.status === 'Error') log(`migration ${r.migrationName} failed`);
  }
  if (error) throw error;
}
