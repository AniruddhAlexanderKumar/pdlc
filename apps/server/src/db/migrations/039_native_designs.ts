import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`
    ALTER TABLE design_documents DROP CONSTRAINT design_documents_kind_check;
    ALTER TABLE design_documents ADD CHECK (kind IN ('diagram', 'model'));
    ALTER TABLE journey_records DROP CONSTRAINT journey_records_kind_check;
    ALTER TABLE journey_records ADD CHECK
      (kind IN ('note','requirement','part','test','change','file','diagram','sketch','model','release'));
  `.execute(db);
}
