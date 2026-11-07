import { z } from "zod";
import type { TerminologyLabelKey } from "./organization";
import { entityIdSchema } from "./shared/identifier";

/**
 * Cross-artifact search.
 *
 * The vocabulary only — what is searchable and what a result looks like.
 * Which table each type lives in, and how that table reaches a project, is
 * persistence detail and belongs to `search.repository.ts`; this file stays
 * Prisma-free like every other domain module. A test in the repository
 * asserts its registry covers exactly the types declared here, so the two
 * cannot drift apart.
 *
 * **There is no relevance score in the result shape, and there is never
 * going to be one.** Search has to order its results — that is what makes
 * it search rather than a list — but the ordering key is not a fact about
 * the engineering record, and showing "87% match" next to a requirement
 * would be exactly the kind of invented figure this product refuses
 * everywhere else. The order is the answer; the number behind it stays
 * inside the query. `search.service.test.ts` asserts the payload carries no
 * score, rank, relevance or percentage field of any kind.
 */

export const SEARCH_ENTITY_TYPES = [
  "STAKEHOLDER_NEED",
  "REQUIREMENT",
  "ENGINEERING_DECISION",
  "DESIGN_ITEM",
  "INTERFACE_DEFINITION",
  "VERIFICATION_ACTIVITY",
  "RISK",
  "ISSUE",
  "CHANGE_REQUEST",
  "EVIDENCE",
  "SUPPLIER",
  "SUPPLIED_ITEM",
  "ENGINEERING_BASELINE",
  "OPERATIONAL_OBSERVATION",
  "CERTIFICATION_PROGRAM",
  "CERTIFICATION_BASIS",
  "COMPLIANCE_ITEM",
  "CERTIFICATION_FINDING",
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
export const searchEntityTypeSchema = z.enum(SEARCH_ENTITY_TYPES);

/**
 * Display labels. Deliberately the canonical nouns: an organization that
 * has renamed "Requirement" sees its own word, but the override is applied
 * at render time from the terminology context, exactly as every other
 * surface does it — not baked in here, where it would be invisible to the
 * override.
 */
const SEARCH_ENTITY_LABELS: Readonly<Record<SearchEntityType, string>> = {
  STAKEHOLDER_NEED: "Stakeholder need",
  REQUIREMENT: "Requirement",
  ENGINEERING_DECISION: "Decision",
  DESIGN_ITEM: "Design item",
  INTERFACE_DEFINITION: "Interface",
  VERIFICATION_ACTIVITY: "Verification activity",
  RISK: "Risk",
  ISSUE: "Issue",
  CHANGE_REQUEST: "Change request",
  EVIDENCE: "Evidence",
  SUPPLIER: "Supplier",
  SUPPLIED_ITEM: "Supplied item",
  ENGINEERING_BASELINE: "Baseline",
  OPERATIONAL_OBSERVATION: "Observation",
  CERTIFICATION_PROGRAM: "Certification programme",
  CERTIFICATION_BASIS: "Certification basis",
  COMPLIANCE_ITEM: "Compliance item",
  CERTIFICATION_FINDING: "Certification finding",
};

export function searchEntityLabel(type: SearchEntityType): string {
  return SEARCH_ENTITY_LABELS[type];
}

/**
 * The terminology key an entity type is renamed by, or `null` where the
 * organization has no override for that concept. Keeps the mapping in one
 * place instead of a switch in the search UI.
 */
const SEARCH_ENTITY_TERMINOLOGY: Readonly<Record<SearchEntityType, TerminologyLabelKey | null>> = {
  STAKEHOLDER_NEED: "stakeholderNeed",
  REQUIREMENT: "requirement",
  ENGINEERING_DECISION: "decision",
  DESIGN_ITEM: "designItem",
  INTERFACE_DEFINITION: null,
  VERIFICATION_ACTIVITY: "verificationActivity",
  RISK: "risk",
  ISSUE: "issue",
  CHANGE_REQUEST: "changeRequest",
  EVIDENCE: "evidence",
  SUPPLIER: "supplier",
  SUPPLIED_ITEM: null,
  ENGINEERING_BASELINE: "baseline",
  OPERATIONAL_OBSERVATION: "observation",
  CERTIFICATION_PROGRAM: "certification",
  CERTIFICATION_BASIS: "certification",
  COMPLIANCE_ITEM: "certification",
  CERTIFICATION_FINDING: "certification",
};

export function searchEntityTerminologyKey(type: SearchEntityType): TerminologyLabelKey | null {
  return SEARCH_ENTITY_TERMINOLOGY[type];
}

/**
 * Where a result opens. Built here rather than in the component so a new
 * searchable type cannot ship without somewhere to go.
 */
export function searchResultHref(result: {
  type: SearchEntityType;
  projectId: string;
  id: string;
}): string {
  const base = `/projects/${result.projectId}`;
  switch (result.type) {
    case "STAKEHOLDER_NEED":
      return `${base}/stakeholder-needs/${result.id}`;
    case "REQUIREMENT":
      return `${base}/requirements/${result.id}`;
    case "ENGINEERING_DECISION":
      return `${base}/decisions/${result.id}`;
    case "DESIGN_ITEM":
      return `${base}/design-items/${result.id}`;
    case "VERIFICATION_ACTIVITY":
      return `${base}/verification/${result.id}`;
    case "RISK":
      return `${base}/risks/${result.id}`;
    case "ISSUE":
      return `${base}/issues/${result.id}`;
    case "CHANGE_REQUEST":
      return `${base}/changes/${result.id}`;
    case "EVIDENCE":
      return `${base}/evidence/${result.id}`;
    case "SUPPLIER":
      return `${base}/suppliers/${result.id}`;
    case "SUPPLIED_ITEM":
      return `${base}/supplied-items/${result.id}`;
    case "ENGINEERING_BASELINE":
      return `${base}/baselines/${result.id}`;
    case "OPERATIONAL_OBSERVATION":
      return `${base}/observations`;
    case "INTERFACE_DEFINITION":
      return `${base}/design-items`;
    case "CERTIFICATION_PROGRAM":
    case "CERTIFICATION_BASIS":
      return `${base}/certification`;
    case "COMPLIANCE_ITEM":
    case "CERTIFICATION_FINDING":
      return `${base}/certification/items`;
  }
}

/** How a result matched — so the UI can say why it is here without showing a number. */
export const SEARCH_MATCH_KINDS = ["IDENTIFIER_EXACT", "IDENTIFIER_PARTIAL", "TEXT"] as const;
export type SearchMatchKind = (typeof SEARCH_MATCH_KINDS)[number];

export interface SearchResult {
  type: SearchEntityType;
  id: string;
  identifier: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  ownerName: string | null;
  updatedAt: string;
  matchKind: SearchMatchKind;
}

export interface SearchResponse {
  /** The term as the server understood it, echoed so the UI never disagrees with what was run. */
  query: string;
  results: SearchResult[];
  /**
   * True when the result set was cut at the limit. Stated plainly rather
   * than left for the reader to infer from a suspiciously round count.
   */
  truncated: boolean;
}

export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 50;

/** A term shorter than this cannot usefully match; the service refuses rather than scanning everything. */
export const SEARCH_TERM_MIN_LENGTH = 2;

export const searchRequestSchema = z.strictObject({
  q: z.string().trim().min(SEARCH_TERM_MIN_LENGTH, "Enter at least two characters").max(200),
  /** Absent means every project the caller can reach. */
  projectId: entityIdSchema.optional(),
  /** Absent means every type. */
  types: z.array(searchEntityTypeSchema).min(1).optional(),
  limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
