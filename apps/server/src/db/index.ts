import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { Database } from './schema.js';

// numeric → number (values are bounded to numeric(14,4), well inside float precision)
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v));
// date → 'YYYY-MM-DD' string, never shifted by the server time zone
pg.types.setTypeParser(1082, (v) => v);
// bigint (count(*)) → number
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX
});

export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

export type Db = Kysely<Database> | Transaction<Database>;
