import { sql, type Kysely } from 'kysely';

/** Persistent, shared limiter buckets; keys are HMACs, not IP addresses or emails. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE founder_rate_limits (
      bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[a-f0-9]{64}$'),
      window_started_at timestamptz NOT NULL,
      attempts integer NOT NULL CHECK (attempts >= 1),
      blocked_until timestamptz,
      updated_at timestamptz NOT NULL
    );
    CREATE INDEX founder_rate_limits_updated_idx ON founder_rate_limits (updated_at);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Founder rate-limit security state cannot be rolled back automatically');
}
