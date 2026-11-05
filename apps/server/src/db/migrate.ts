import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { db } from './index.js';
import * as m001 from './migrations/001_init.js';
import * as m002 from './migrations/002_analytics.js';
import * as m003 from './migrations/003_dashboard_layout.js';
import * as m004 from './migrations/004_access_requests.js';
import * as m005 from './migrations/005_system_admins.js';
import * as m006 from './migrations/006_projects_issues.js';
import * as m007 from './migrations/007_teamwork_graph.js';
import * as m008 from './migrations/008_graph_search_indexes.js';
import * as m009 from './migrations/009_app_layout.js';
import * as m010 from './migrations/010_language.js';
import * as m011 from './migrations/011_workspace_mode.js';
import * as m012 from './migrations/012_demo_guests.js';
import * as m013 from './migrations/013_access_request_optional_fields.js';
import * as m014 from './migrations/014_access_pricing.js';
import * as m015 from './migrations/015_external_reviews.js';
import * as m016 from './migrations/016_pricing_proposals.js';
import * as m017 from './migrations/017_education_requests.js';
import * as m018 from './migrations/018_help_centre.js';
import * as m019 from './migrations/019_help_guide_correction.js';
import * as m020 from './migrations/020_assistant.js';
import * as m021 from './migrations/021_assistant_status.js';
import * as m022 from './migrations/022_assistant_priority.js';
import * as m023 from './migrations/023_workspace_profiles.js';
import * as m024 from './migrations/024_voice_import_integrity.js';

/**
 * Migrations are imported statically so they are bundled into the production build.
 * To add one: create migrations/NNN_name.ts and register it here. Never edit a migration
 * that has already run in production.
 */
const migrations: Record<string, Migration> = {
  '001_init': m001,
  '002_analytics': m002,
  '003_dashboard_layout': m003,
  '004_access_requests': m004,
  '005_system_admins': m005,
  '006_projects_issues': m006,
  '007_teamwork_graph': m007,
  '008_graph_search_indexes': m008,
  '009_app_layout': m009,
  '010_language': m010,
  '011_workspace_mode': m011,
  '012_demo_guests': m012,
  '013_access_request_optional_fields': m013,
  '014_access_pricing': m014,
  '015_external_reviews': m015,
  '016_pricing_proposals': m016,
  '017_education_requests': m017,
  '018_help_centre': m018,
  '019_help_guide_correction': m019,
  '020_assistant': m020,
  '021_assistant_status': m021,
  '022_assistant_priority': m022,
  '023_workspace_profiles': m023,
  '024_voice_import_integrity': m024
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
