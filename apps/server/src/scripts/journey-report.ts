/** Compare locally before/after the 036 cutover. Aggregate only: no accounts, document text or credentials. */
import { sql } from 'kysely';
import { db } from '../db/index.js';
try {
  const report = await db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (trx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(trx);
      const { upgraded, supported } = (
        await sql<{
          upgraded: boolean;
          supported: boolean;
        }>`SELECT to_regclass('journey_upgrades') IS NOT NULL AS upgraded,to_regclass('activity_drafts') IS NOT NULL AS supported`.execute(
          trx
        )
      ).rows[0];
      if (!supported)
        throw Error(
          'This aggregate report requires a restored 035 or later schema. Do not modify a live database just to run the report.'
        );
      const inventory = (
        await sql`SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM workspaces)::int AS workspaces,(SELECT count(*) FROM memberships)::int AS memberships,(SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM answers)::int AS answers,(SELECT count(*) FROM tasks)::int AS tasks,(SELECT count(*) FROM activity_drafts)::int AS private_drafts,(SELECT count(*) FROM activity_records WHERE review_state='approved')::int AS signoffs,(SELECT count(*) FROM design_documents)::int AS design_documents,(SELECT count(*) FROM design_revisions)::int AS design_revisions,(SELECT count(*) FROM product_cad_models)::int AS cad_models,(SELECT count(*) FROM xp_events)::int AS transactions,(SELECT coalesce(sum(points),0) FROM xp_events) AS xp`.execute(
          trx
        )
      ).rows[0];
      if (!upgraded) return { phase: 'pre-036', inventory };
      const upgrades = (
        await sql`SELECT version,count(*)::int AS upgraded_products,sum(cardinality(known_keys))::int AS prior_sections,
     sum(cardinality(imported_keys))::int AS exact_field_matches,sum((counts->>'unlinkedTasks')::int)::int AS tasks_needing_placement,
     sum((counts->>'unknownStage')::int)::int AS unrecognised_stage_names,count(*) FILTER(WHERE needs_placement)::int AS positions_to_confirm,
     sum((counts->>'designs')::int)::int AS linked_designs FROM journey_upgrades GROUP BY version`.execute(trx)
      ).rows;
      const receipts = (
        await sql`SELECT split_part(node,':',1) AS milestone,origin,count(*)::int AS receipts FROM journey_stamps GROUP BY 1,2 ORDER BY 1,2`.execute(
          trx
        )
      ).rows;
      const ledger = (
        await sql`SELECT origin,count(*)::int AS transactions,sum(points) AS xp FROM xp_events GROUP BY origin ORDER BY origin`.execute(
          trx
        )
      ).rows;
      return { phase: 'worlds-v1', inventory, upgrades, receipts, ledger };
    });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
