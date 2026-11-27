import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`
    ALTER TABLE journey_activities ADD COLUMN skipped_at timestamptz;
    CREATE TABLE journey_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      activity_id uuid REFERENCES journey_activities(id) ON DELETE SET NULL,
      kind text NOT NULL CHECK (kind IN ('note','requirement','part','test','change','file','diagram','sketch','release')),
      label text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (activity_id, kind, label)
    );
    CREATE INDEX journey_records_project_idx ON journey_records (project_id, created_at);
    CREATE TABLE journey_file_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id uuid NOT NULL REFERENCES journey_records(id) ON DELETE CASCADE,
      sequence bigint GENERATED ALWAYS AS IDENTITY,
      filename text NOT NULL,
      bytes bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX journey_file_versions_record_idx ON journey_file_versions (record_id, sequence DESC);
  `.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`DROP TABLE journey_file_versions; DROP TABLE journey_records; ALTER TABLE journey_activities DROP COLUMN skipped_at`.execute(db);
}
