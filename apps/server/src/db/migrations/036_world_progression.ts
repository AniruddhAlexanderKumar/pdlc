import { sql, type Kysely } from 'kysely';
import { requirements036 } from '../worlds-036-manifest.js';

// The snapshot contains identifiers/counts, not another copy of the customer's documents.
// A singleton cutover + per-product PK separates retries from products created after release.
export async function up(db: Kysely<unknown>) {
  await sql`
    CREATE TABLE IF NOT EXISTS journey_cutover(version text PRIMARY KEY, badges_recorded boolean NOT NULL DEFAULT false, applied_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO journey_cutover(version) VALUES ('worlds-v1') ON CONFLICT DO NOTHING;
    ALTER TABLE users ALTER COLUMN show_streak SET DEFAULT true;
    ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'legacy' CHECK(origin IN ('legacy','earned'));
    ALTER TABLE xp_events ALTER COLUMN origin SET DEFAULT 'earned';
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_kind_check;
    ALTER TABLE products ADD CONSTRAINT products_product_kind_check CHECK(product_kind IN ('physical','software','service','other','engineering','hardware','consumer'));
    CREATE TABLE IF NOT EXISTS journey_upgrades(product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      version text NOT NULL REFERENCES journey_cutover(version),original_stage text NOT NULL, through_stage text NOT NULL,needs_placement boolean NOT NULL DEFAULT false,
      known_keys text[] NOT NULL DEFAULT '{}', imported_keys text[] NOT NULL DEFAULT '{}', counts jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS journey_stamps(product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,node text NOT NULL,
      origin text NOT NULL CHECK(origin IN ('recognised','earned')),actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(product_id,node));
    CREATE TABLE IF NOT EXISTS builder_activity_days(workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date), PRIMARY KEY(workspace_id,user_id,day));
    CREATE TABLE IF NOT EXISTS builder_badges(workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,badge text NOT NULL,origin text NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,user_id,badge));
    CREATE INDEX IF NOT EXISTS xp_product_period ON xp_events(workspace_id,user_id,product_id,created_at) WHERE origin='earned';
    CREATE INDEX IF NOT EXISTS designs_product_world ON design_documents(product_id,updated_at DESC) WHERE product_id IS NOT NULL;
  `.execute(db);
  // Two badges in the old engine were *workspace* predicates, not attributable personal work.
  // Preserve those entitlements explicitly, without inventing a contributor or issuing points.
  await sql`WITH old_ws AS (SELECT w.id FROM workspaces w, journey_cutover c WHERE c.version='worlds-v1' AND w.created_at <= c.applied_at),
    eligible AS (SELECT workspace_id,'scout' AS badge FROM suppliers GROUP BY workspace_id HAVING count(*)>=3
      UNION SELECT workspace_id,'margin_master' FROM (SELECT p.workspace_id,p.target_price,
      p.labour+p.packaging+p.overhead+coalesce((SELECT sum(m.unit_price*pm.quantity) FROM product_materials pm JOIN materials m ON m.id=pm.material_id WHERE pm.product_id=p.id),0) AS cost
      FROM products p WHERE p.target_price>0) costs WHERE cost>0 AND cost<=target_price/2)
    INSERT INTO builder_badges(workspace_id,user_id,badge,origin) SELECT m.workspace_id,m.user_id,e.badge,'legacy_team' FROM memberships m
    JOIN old_ws o ON o.id=m.workspace_id JOIN eligible e ON e.workspace_id=m.workspace_id,journey_cutover c
    WHERE c.version='worlds-v1' AND NOT c.badges_recorded AND m.created_at<=c.applied_at ON CONFLICT DO NOTHING`.execute(
    db
  );
  await sql`UPDATE journey_cutover SET badges_recorded=true WHERE version='worlds-v1' AND NOT badges_recorded`.execute(
    db
  );
  // Bounded keyset scan. The discovery sources do not include private drafts, unrelated projects, or binary CAD payloads.
  const stages = [
    'Idea',
    'Research',
    'Planning',
    'Design',
    'Prototype',
    'Testing',
    'Launch',
    'Improvement',
    'Retired'
  ];
  const aliases: Record<string, string> = {
    concept: 'Idea',
    'market research': 'Research',
    prototyping: 'Prototype',
    launched: 'Launch',
    iteration: 'Improvement',
    archived: 'Retired'
  };
  const canonical = (s: string | null) => {
    const k = s?.trim().toLowerCase() ?? '';
    return stages.find((x) => x.toLowerCase() === k) ?? (Object.hasOwn(aliases, k) ? aliases[k] : null);
  };
  let cursor: string | null = null;
  for (;;) {
    const batch = await sql<{
      id: string;
      stage: string;
      product_kind: string;
      legacy_stage: string | null;
      description: string;
      category: string;
      target_price: number | null;
      overhead: number;
      history: string[];
      answers: Record<string, unknown>;
      approved: string[];
      chapters: string[];
      counts: Record<string, number>;
      advanced: string[];
      cleared: string[];
      prerequisites: string[];
    }>`
      SELECT p.id,p.stage,p.product_kind,p.legacy_stage,p.description,p.category,p.target_price::float8,p.overhead::float8,
      ARRAY(SELECT h.to_stage FROM stage_history h WHERE h.product_id=p.id ORDER BY h.created_at,h.id) AS history,
      ARRAY(SELECT h.from_stage||'>'||h.to_stage FROM stage_history h WHERE h.product_id=p.id AND h.from_stage IS NOT NULL AND h.to_stage<>h.from_stage) AS advanced,
      ARRAY(SELECT split_part(x.ref,':',2) FROM xp_events x WHERE x.product_id=p.id AND x.workspace_id=p.workspace_id AND x.kind='quest_complete') AS cleared,
      ARRAY(SELECT DISTINCT d.activity_key FROM activity_dependencies d WHERE d.product_id=p.id) AS prerequisites,
      coalesce((SELECT jsonb_object_agg(a.question_key,a.value) FROM answers a WHERE a.product_id=p.id),'{}') AS answers,
      ARRAY(SELECT r.activity_key FROM activity_records r WHERE r.product_id=p.id AND r.review_state='approved') AS approved,
      ARRAY(SELECT DISTINCT t.chapter FROM tasks t WHERE t.product_id=p.id AND t.chapter IS NOT NULL) AS chapters,
      jsonb_build_object('tasks',(SELECT count(*) FROM tasks t WHERE t.product_id=p.id),'unlinkedTasks',(SELECT count(*) FROM tasks t WHERE t.product_id=p.id AND t.chapter IS NULL),
        'designs',(SELECT count(*) FROM design_documents d WHERE d.product_id=p.id AND d.workspace_id=p.workspace_id),
        'cadModels',(SELECT count(*) FROM product_cad_models m WHERE m.product_id=p.id AND m.workspace_id=p.workspace_id),
        'bomLines',(SELECT count(*) FROM product_materials pm WHERE pm.product_id=p.id),'notes',CASE WHEN btrim(p.notes)<>'' THEN 1 ELSE 0 END) AS counts
      FROM products p,journey_cutover c WHERE c.version='worlds-v1' AND p.created_at<=c.applied_at ${cursor ? sql`AND p.id>${cursor}::uuid` : sql``}
      AND NOT EXISTS(SELECT 1 FROM journey_upgrades u WHERE u.product_id=p.id) ORDER BY p.id LIMIT 100`.execute(
      db
    );
    if (!batch.rows.length) break;
    for (const p of batch.rows) {
      cursor = p.id;
      const visits = p.history.map(canonical).filter((x) => x !== null);
      const hints = Object.keys(p.answers)
        .map((k) => canonical(k.split('.')[0] === 'improve' ? 'Improvement' : k.split('.')[0]))
        .concat(p.chapters.map(canonical));
      const evidenceFocus =
        stages[Math.max(0, ...hints.filter((s) => s && s !== 'Retired').map((s) => stages.indexOf(s!)))];
      const stage = canonical(p.stage) ?? visits.at(-1) ?? evidenceFocus;
      const high =
        stages[
          Math.max(
            0,
            ...[stage, canonical(p.legacy_stage), ...visits]
              .filter((s) => s && s !== 'Retired')
              .map((s) => stages.indexOf(s!))
          )
        ];
      // A formerly archived product could be reopened anywhere. Preserve that access,
      // but do not interpret the archive itself as a visit or completed milestone.
      const accessHigh = stage === 'Retired' || canonical(p.legacy_stage) === 'Retired' ? 'Improvement' : high;
      const known = Object.keys(p.answers),
        imported: string[] = [];
      for (const [key, value] of Object.entries({
        'idea.oneliner': p.description.trim().length <= 300 ? p.description.trim() : null,
        'idea.category':
          p.category.trim() !== 'General' && p.category.trim().length <= 60 ? p.category.trim() : null,
        'planning.target_price':
          p.target_price !== null && p.target_price >= 0 && p.target_price <= 1e10 ? p.target_price : null,
        'prototype.overhead': p.overhead > 0 && p.overhead <= 1e10 ? p.overhead : null
      })) {
        if (value == null || value === '' || Object.hasOwn(p.answers, key)) continue;
        const inserted =
          await sql`INSERT INTO answers(product_id,question_key,value,answered_by) VALUES(${p.id},${key},${JSON.stringify(value)}::jsonb,NULL) ON CONFLICT DO NOTHING RETURNING question_key`.execute(
            db
          );
        if (inserted.rows.length) {
          p.answers[key] = value;
          imported.push(key);
        }
      }
      // An imported timestamp is recognition time; never invent an old author, approval or submission date.
      await sql`INSERT INTO journey_upgrades(product_id,version,original_stage,through_stage,needs_placement,known_keys,imported_keys,counts) VALUES(${p.id},'worlds-v1',${p.stage},${high},${!canonical(p.stage)},${[...known, ...imported]}::text[],${imported}::text[],${JSON.stringify({ ...p.counts, answers: known.length, imported: imported.length, unknownStage: canonical(p.stage) ? 0 : 1 })}::jsonb) ON CONFLICT DO NOTHING`.execute(
        db
      );
      await sql`UPDATE products SET stage=${stage},legacy_stage=${accessHigh} WHERE id=${p.id} AND (stage IS DISTINCT FROM ${stage} OR legacy_stage IS DISTINCT FROM ${accessHigh})`.execute(
        db
      );
      const units = new Map<string, { world: string; ready: boolean }>();
      for (const [unit, world, key, type, kinds, options] of requirements036) {
        if (kinds && !kinds.includes(p.product_kind)) continue;
        const v = p.answers[key];
        let ok = false;
        if (type === 'record')
          ok =
            key === 'description'
              ? !!p.description.trim()
              : key === 'price'
                ? p.target_price !== null
                : p.chapters.includes(world);
        else if (type === 'yesno') ok = typeof v === 'boolean';
        else if (type === 'number' || type === 'money')
          ok =
            typeof v === 'number' &&
            Number.isFinite(v) &&
            v >= 0 &&
            v <= 1e12 &&
            (type === 'money' || Number.isInteger(v));
        else if (type === 'choice') ok = typeof v === 'string' && !!options?.includes(v);
        else if (type === 'multi')
          ok =
            Array.isArray(v) && v.length > 0 && v.every((x) => options?.includes(x) && x !== 'None finished yet');
        else if (type === 'ranked')
          ok =
            Array.isArray(v) &&
            v.length > 0 &&
            v.length <= 12 &&
            v.every((x) => typeof x === 'string' && x.trim() && x.length <= 200) &&
            new Set(v.map((x) => x.trim())).size === v.length;
        else if (type === 'comparison')
          ok =
            Array.isArray(v) &&
            v.length === 3 &&
            v.every((x) => typeof x === 'string' && x.trim() && x.length <= 1000);
        else if (type === 'evidence')
          ok =
            Array.isArray(v) &&
            v.length === 3 &&
            ['Research finding', 'Independent evidence'].includes(v[0]) &&
            v.every((x) => typeof x === 'string' && x.trim() && x.length <= 2000);
        else if (type === 'date')
          ok =
            typeof v === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v;
        else ok = typeof v === 'string' && !!v.trim() && v.length <= (type === 'text' ? 300 : 5000);
        if (['research.validated', 'design.must_haves', 'testing.criteria'].includes(key))
          ok = ok && p.approved.includes(key);
        // Dependency-bearing work is rechecked by the live resolver, never auto-certified by the cutover.
        if (p.prerequisites.includes(key)) ok = false;
        units.set(unit, { world, ready: ok && (units.get(unit)?.ready ?? true) });
      }
      const nodes = Array.from(units)
        .filter(([, v]) => v.ready)
        .map(([k]) => 'unit:' + k);
      for (const world of stages.slice(0, 8))
        if (
          Array.from(units.values())
            .filter((u) => u.world === world)
            .every((u) => u.ready)
        ) {
          nodes.push('checkpoint:' + world);
          if (
            world !== 'Improvement' &&
            p.cleared.includes(world) &&
            p.advanced.some((s) => {
              const [a, b] = s.split('>');
              return canonical(a) === world && canonical(b) === stages[stages.indexOf(world) + 1];
            })
          )
            nodes.push('world:' + world);
        }
      if (nodes.length)
        await sql`INSERT INTO journey_stamps(product_id,node,origin) SELECT ${p.id}::uuid,n,'recognised' FROM unnest(${nodes}::text[]) n ON CONFLICT DO NOTHING`.execute(
          db
        );
    }
  }
}
export async function down(): Promise<void> {
  throw Error('Refusing to discard journey history; restore a matching backup or roll forward.');
}
