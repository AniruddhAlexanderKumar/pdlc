import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<unknown>):Promise<void>{await sql`ALTER TABLE access_requests ADD COLUMN education_details jsonb, ADD COLUMN education_pricing_snapshot jsonb, ADD COLUMN proposed_education_pricing_snapshot jsonb`.execute(db);}
export async function down(db:Kysely<unknown>):Promise<void>{await sql`ALTER TABLE access_requests DROP COLUMN proposed_education_pricing_snapshot, DROP COLUMN education_pricing_snapshot, DROP COLUMN education_details`.execute(db);}
