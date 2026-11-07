import {
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
  type SearchMatchKind,
} from "@/domain/search";
import { Prisma } from "@/generated/prisma/client";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Cross-artifact search against PostgreSQL full text, with authorization
 * inside the query.
 *
 * ## Why this is one hand-written query rather than eighteen Prisma calls
 *
 * Search spans eighteen artifact tables and has to order results *across*
 * them: a decision and a risk compete for the same top slot. Eighteen
 * separate `findMany` calls could not do that — they would each return
 * their own best matches and leave the merge to application code, which is
 * both slower and wrong (each list is truncated before the comparison that
 * matters). So this is one `UNION ALL` with a single outer ordering.
 *
 * ## Why the authorization is a CTE and not a filter on the results
 *
 * `readable` resolves, in SQL, the exact set of projects this caller may
 * read — a membership row, or the implicit grant an OWNER/EXECUTIVE holds
 * — and every branch *inner joins* it. A row the caller cannot read is
 * therefore never produced, rather than produced and discarded. That
 * matters beyond tidiness: a post-filter would let an unreadable row
 * consume a slot in `LIMIT`, so a caller could infer the existence of
 * another project's data from the results they *didn't* get back.
 *
 * ## Injection posture
 *
 * `Prisma.raw` splices SQL text without escaping, so it is reachable only
 * from `SEARCHABLE_ENTITIES` below — module-level constants, never a value
 * derived from a request. Every caller-supplied value (the term, the limit,
 * the organization, the actor, the project) is a bound parameter. The two
 * kinds of value never mix, and `search.repository.test.ts` asserts the
 * registry contains nothing but known table and column identifiers.
 */

/** How alike two identifiers must be before a partial match counts. `REQ-01` → `REQ-001` scores about 0.67. */
const IDENTIFIER_SIMILARITY_THRESHOLD = 0.3;

interface SearchableEntity {
  readonly type: SearchEntityType;
  readonly table: string;
  /** The human-facing name column — `title` on most, `name` on the rest. */
  readonly titleColumn: string;
  /** Free-text columns that should match on content, weighted below the title. */
  readonly bodyColumns: readonly string[];
  readonly ownerColumn: string | null;
  /** Joins that carry this table to a project. Empty when `projectId` is on the row. */
  readonly projectJoin: string;
  /** The expression naming the project id, once `projectJoin` has been applied. */
  readonly projectIdExpr: string;
}

const CERTIFICATION_PROGRAM_JOIN =
  'JOIN "certification_programs" cp ON cp."id" = e."certificationProgramId"';
const CERTIFICATION_BASIS_JOIN =
  'JOIN "certification_bases" cb ON cb."id" = e."certificationBasisId" ' +
  'JOIN "certification_programs" cp ON cp."id" = cb."certificationProgramId"';
const CERTIFICATION_FINDING_JOIN =
  'JOIN "compliance_items" ci ON ci."id" = e."complianceItemId" ' +
  'JOIN "certification_bases" cb ON cb."id" = ci."certificationBasisId" ' +
  'JOIN "certification_programs" cp ON cp."id" = cb."certificationProgramId"';

const OWN_PROJECT = { projectJoin: "", projectIdExpr: 'e."projectId"' } as const;

/**
 * Every searchable artifact type, and how to reach it.
 *
 * Adding a type here is the whole change: the query builder, the migration
 * generator, and the index expressions all read this one list, so a new
 * artifact cannot be searchable in the query but unindexed in the database,
 * or vice versa. A test asserts this covers exactly `SEARCH_ENTITY_TYPES`.
 */
export const SEARCHABLE_ENTITIES: readonly SearchableEntity[] = [
  { type: "STAKEHOLDER_NEED", table: "stakeholder_needs", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "REQUIREMENT", table: "requirements", titleColumn: "title", bodyColumns: ["statement", "rationale"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "ENGINEERING_DECISION", table: "engineering_decisions", titleColumn: "title", bodyColumns: ["statement", "rationale"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "DESIGN_ITEM", table: "design_items", titleColumn: "name", bodyColumns: ["description"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "INTERFACE_DEFINITION", table: "interface_definitions", titleColumn: "name", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "VERIFICATION_ACTIVITY", table: "verification_activities", titleColumn: "title", bodyColumns: ["description"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "RISK", table: "risks", titleColumn: "title", bodyColumns: ["description"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "ISSUE", table: "issues", titleColumn: "title", bodyColumns: ["description"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "CHANGE_REQUEST", table: "change_requests", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "EVIDENCE", table: "evidence", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "SUPPLIER", table: "suppliers", titleColumn: "name", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "SUPPLIED_ITEM", table: "supplied_items", titleColumn: "name", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "ENGINEERING_BASELINE", table: "engineering_baselines", titleColumn: "name", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "OPERATIONAL_OBSERVATION", table: "operational_observations", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, ...OWN_PROJECT },
  { type: "CERTIFICATION_PROGRAM", table: "certification_programs", titleColumn: "name", bodyColumns: ["description"], ownerColumn: "ownerId", ...OWN_PROJECT },
  { type: "CERTIFICATION_BASIS", table: "certification_bases", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, projectJoin: CERTIFICATION_PROGRAM_JOIN, projectIdExpr: 'cp."projectId"' },
  { type: "COMPLIANCE_ITEM", table: "compliance_items", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, projectJoin: CERTIFICATION_BASIS_JOIN, projectIdExpr: 'cp."projectId"' },
  { type: "CERTIFICATION_FINDING", table: "certification_findings", titleColumn: "title", bodyColumns: ["description"], ownerColumn: null, projectJoin: CERTIFICATION_FINDING_JOIN, projectIdExpr: 'cp."projectId"' },
];

/**
 * The searchable-text expression for one entity.
 *
 * **The migration's index and this query must produce byte-identical SQL
 * text**, or PostgreSQL will not recognise the expression index and every
 * search becomes a sequential scan over eighteen tables — a silent
 * performance collapse rather than an error. So both are generated from
 * this one function, differing only in the alias, and
 * `search.repository.test.ts` re-derives the index expressions and asserts
 * the committed migration contains each one verbatim.
 *
 * `simple` for the identifier (stemming `REQ-001` helps nobody), `english`
 * for prose. Weights are positional only — `ts_rank` reads them to order
 * results, and that order never surfaces as a number.
 */
export function tsvectorExpression(entity: SearchableEntity, alias: string): string {
  const column = (name: string) => `${alias}"${name}"`;
  return [
    `setweight(to_tsvector('simple', coalesce(${column("identifier")}, '')), 'A')`,
    `setweight(to_tsvector('english', coalesce(${column(entity.titleColumn)}, '')), 'B')`,
    ...entity.bodyColumns.map(
      (body) => `setweight(to_tsvector('english', coalesce(${column(body)}, '')), 'C')`,
    ),
  ].join(" || ");
}

export interface SearchRow {
  type: SearchEntityType;
  id: string;
  identifier: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  ownerName: string | null;
  updatedAt: Date;
  matchKind: SearchMatchKind;
}

export interface SearchParams {
  organizationId: string;
  actorId: string;
  /** True for OWNER and EXECUTIVE — every project in the organization, with no membership row. */
  hasImplicitProjectAccess: boolean;
  term: string;
  projectId?: string;
  types?: readonly SearchEntityType[];
  /** The caller asks for one more than it will show, so truncation is known rather than guessed. */
  limit: number;
}

export async function search(params: SearchParams, client: DbClient = prisma): Promise<SearchRow[]> {
  const selected = params.types
    ? SEARCHABLE_ENTITIES.filter((entity) => params.types!.includes(entity.type))
    : SEARCHABLE_ENTITIES;

  if (selected.length === 0) return [];

  const term = params.term;

  // Resolved in SQL so no branch below can see a project this caller cannot
  // read. The project name rides along, sparing eighteen joins to `projects`.
  const readable = Prisma.sql`
    SELECT p."id" AS "projectId", p."name" AS "projectName"
    FROM "projects" p
    WHERE p."organizationId" = ${params.organizationId}
      AND (
        ${params.hasImplicitProjectAccess}
        OR EXISTS (
          SELECT 1 FROM "project_memberships" m
          WHERE m."projectId" = p."id" AND m."userId" = ${params.actorId}
        )
      )
      ${params.projectId ? Prisma.sql`AND p."id" = ${params.projectId}` : Prisma.empty}
  `;

  const branches = selected.map((entity) => {
    // Every `Prisma.raw` here takes a module-level constant. None is reachable from a request.
    const vector = Prisma.raw(tsvectorExpression(entity, "e."));
    const table = Prisma.raw(`"${entity.table}"`);
    const joins = Prisma.raw(entity.projectJoin);
    const projectId = Prisma.raw(entity.projectIdExpr);
    const title = Prisma.raw(`e."${entity.titleColumn}"`);
    const owner = Prisma.raw(entity.ownerColumn ? `e."${entity.ownerColumn}"` : "NULL");

    return Prisma.sql`(
      SELECT
        ${entity.type} AS "type",
        e."id" AS "id",
        e."identifier" AS "identifier",
        ${title} AS "title",
        e."status"::text AS "status",
        ${owner} AS "ownerId",
        e."updatedAt" AS "updatedAt",
        rp."projectId" AS "projectId",
        rp."projectName" AS "projectName",
        CASE
          WHEN lower(e."identifier") = lower(${term}) THEN 'IDENTIFIER_EXACT'
          WHEN e."identifier" ILIKE ${term + "%"}
            OR similarity(e."identifier", ${term}) >= ${IDENTIFIER_SIMILARITY_THRESHOLD}
            THEN 'IDENTIFIER_PARTIAL'
          ELSE 'TEXT'
        END AS "matchKind",
        ts_rank(${vector}, websearch_to_tsquery('english', ${term})) AS "rank"
      FROM ${table} e
      ${joins}
      JOIN (${readable}) rp ON rp."projectId" = ${projectId}
      WHERE
        lower(e."identifier") = lower(${term})
        OR e."identifier" ILIKE ${term + "%"}
        OR similarity(e."identifier", ${term}) >= ${IDENTIFIER_SIMILARITY_THRESHOLD}
        OR ${vector} @@ websearch_to_tsquery('english', ${term})
      ORDER BY "rank" DESC, e."updatedAt" DESC, e."id" ASC
      LIMIT ${params.limit}
    )`;
  });

  // Ordering is total and deterministic: an exact identifier wins outright,
  // then a partial one, then text relevance, then recency, and `id` breaks
  // any remaining tie so two runs over unchanged data cannot differ.
  return client.$queryRaw<SearchRow[]>`
    SELECT
      r."type", r."id", r."identifier", r."title", r."status",
      r."projectId", r."projectName", r."updatedAt", r."matchKind",
      u."name" AS "ownerName"
    FROM (${Prisma.join(branches, " UNION ALL ")}) r
    LEFT JOIN "users" u ON u."id" = r."ownerId"
    ORDER BY
      CASE r."matchKind"
        WHEN 'IDENTIFIER_EXACT' THEN 0
        WHEN 'IDENTIFIER_PARTIAL' THEN 1
        ELSE 2
      END ASC,
      r."rank" DESC,
      r."updatedAt" DESC,
      r."id" ASC
    LIMIT ${params.limit}
  `;
}

/**
 * The DDL this module needs in the database, derived from the registry.
 *
 * Exported so the migration can be generated from the same source the query
 * reads, and so a test can prove the committed migration still matches.
 */
export function searchIndexStatements(): string[] {
  return SEARCHABLE_ENTITIES.flatMap((entity) => [
    `CREATE INDEX IF NOT EXISTS "${entity.table}_search_idx" ON "${entity.table}" USING GIN ((${tsvectorExpression(entity, "")}));`,
    `CREATE INDEX IF NOT EXISTS "${entity.table}_identifier_trgm_idx" ON "${entity.table}" USING GIN ("identifier" gin_trgm_ops);`,
  ]);
}

/** Declared here so the domain list and this registry can be checked against each other in one place. */
export const SEARCHABLE_ENTITY_TYPES: readonly SearchEntityType[] = SEARCH_ENTITY_TYPES;
