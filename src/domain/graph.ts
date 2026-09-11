import { z } from "zod";
import { entityIdSchema } from "./shared/identifier";

/**
 * The cross-domain engineering graph.
 *
 * PostgreSQL remains the system of record. This is a *logical* graph over the
 * relationship tables the domain modules already write — there is no graph
 * database, and no second copy of any edge. When RequirementService writes a
 * link, the graph sees it because it reads the same row.
 *
 * Everything here is Prisma-free: node and edge types, the authoritative edge
 * registry, request validation, and the result shapes.
 */

// --- Node types -------------------------------------------------------------

/**
 * The engineering objects that can appear as graph nodes.
 *
 * Every one of these is backed by a real table. Nothing is listed
 * speculatively — a type here means the record exists and can be resolved.
 */
export const GRAPH_NODE_TYPES = [
  "PROJECT",
  "STAKEHOLDER_NEED",
  "REQUIREMENT",
  "ENGINEERING_DECISION",
  "DECISION_ALTERNATIVE",
  "DECISION_ASSUMPTION",
  "DECISION_EXPECTATION",
  "DESIGN_ITEM",
  "INTERFACE_DEFINITION",
  "VERIFICATION_ACTIVITY",
  "RISK",
  "ISSUE",
  "CHANGE_REQUEST",
  "EVIDENCE",
  "APPROVAL",
  // Supplier engineering. These are here because a supplied item genuinely
  // participates in the product — it is allocated to design, supports
  // requirements and is governed by decisions — so a change to it has to be
  // walkable by the same engine as everything else. They are not commercial
  // records: there is no purchase order or contract node, and there will not be.
  "SUPPLIER",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
  // Design / operations drift. These are records *about* engineering rather
  // than engineering objects themselves: a baseline is a reference point, an
  // observation is a report, and an assessment is a comparison. They are nodes
  // so a reader can traverse from a design item to what was baselined about it
  // and what has since been observed — not so that change can propagate through
  // them. See IMPACT_PROPAGATION, where every one of their edges is inert.
  "ENGINEERING_BASELINE",
  "BASELINE_MEMBER",
  "OPERATIONAL_OBSERVATION",
  "DRIFT_ASSESSMENT",
  "DRIFT_FINDING",
  // Certification workspace. These sit downstream of engineering, exactly as
  // drift's records do: a compliance item references what it depends on, and
  // a review records what was concluded, but neither is itself an
  // engineering object. See IMPACT_PROPAGATION for the one edge among these
  // that is allowed to surface as context — every other one is inert, for
  // the same reason drift's own structural edges are.
  "CERTIFICATION_PROGRAM",
  "CERTIFICATION_BASIS",
  "COMPLIANCE_ITEM",
  "CERTIFICATION_FINDING",
  "CERTIFICATION_REVIEW",
  "CERTIFICATION_REVIEW_FINDING",
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];
export const graphNodeTypeSchema = z.enum(GRAPH_NODE_TYPES);

/**
 * A node is an identity reference, not the artifact itself.
 *
 * Deliberately lightweight: a traversal that pulled every column of every
 * visited record would be far more expensive than the traversal itself. A
 * caller that needs the full artifact loads it from that module's own API.
 */
export interface GraphNode {
  type: GraphNodeType;
  id: string;
  projectId: string;
  /** Human-facing key where the artifact has one ("REQ-001"); null otherwise. */
  identifier: string | null;
  /** Short display text — title, name, or statement depending on the type. */
  label: string;
}

// --- Edge types -------------------------------------------------------------

/**
 * Canonical relationship types.
 *
 * Each corresponds to a relationship that genuinely exists in the schema. No
 * type is present merely to round out the enum.
 */
export const GRAPH_EDGE_TYPES = [
  "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
  "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
  "REQUIREMENT_ALLOCATED_TO_DESIGN",
  "REQUIREMENT_VERIFIED_BY",
  "REQUIREMENT_LINKED_TO_DECISION",
  "REQUIREMENT_HAS_EVIDENCE",
  "DECISION_AFFECTS_DESIGN",
  "DECISION_AFFECTS_RISK",
  "DECISION_AFFECTS_ISSUE",
  "DECISION_HAS_EVIDENCE",
  "DECISION_HAS_ALTERNATIVE",
  "DECISION_HAS_ASSUMPTION",
  "DECISION_HAS_EXPECTATION",
  "DESIGN_CHILD_OF_DESIGN",
  "DESIGN_CONNECTS_INTERFACE",
  "VERIFICATION_HAS_EVIDENCE",
  "RISK_AFFECTS_REQUIREMENT",
  "RISK_AFFECTS_DESIGN",
  "ISSUE_AFFECTS_REQUIREMENT",
  "ISSUE_AFFECTS_DESIGN",
  "CHANGE_IMPACTS_OBJECT",
  "APPROVAL_RELATES_TO_OBJECT",
  "SUPPLIER_PROVIDES_ITEM",
  "SUPPLIER_HAS_QUALIFICATION",
  "SUPPLIED_ITEM_QUALIFIED_BY",
  "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
  "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
  "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
  "SUPPLIED_ITEM_LINKED_TO_DECISION",
  "SUPPLIED_ITEM_LINKED_TO_RISK",
  "SUPPLIED_ITEM_HAS_EVIDENCE",
  "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
  "BASELINE_HAS_MEMBER",
  "BASELINE_MEMBER_REFERENCES_OBJECT",
  "OBSERVATION_CONCERNS_OBJECT",
  "DRIFT_ASSESSMENT_AGAINST_BASELINE",
  "DRIFT_ASSESSMENT_HAS_FINDING",
  "DRIFT_FINDING_CONCERNS_OBJECT",
  "CERTIFICATION_PROGRAM_HAS_BASIS",
  "CERTIFICATION_PROGRAM_HAS_REVIEW",
  "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
  "COMPLIANCE_ITEM_LINKED_TO_OBJECT",
  "COMPLIANCE_ITEM_HAS_FINDING",
  "CERTIFICATION_REVIEW_HAS_FINDING",
  "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT",
] as const;

export type GraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number];
export const graphEdgeTypeSchema = z.enum(GRAPH_EDGE_TYPES);

/**
 * One entry in the authoritative edge registry.
 *
 * The direction is stated here once, so no one has to infer it from a table
 * name. `targets` is a list only because two relationships are genuinely
 * polymorphic on their target (a change request impacts one of six artifact
 * types; an approval attaches to one of three) — and even those use real
 * per-type foreign keys in the database, never an opaque entity pair.
 */
export interface GraphEdgeDefinition {
  type: GraphEdgeType;
  source: GraphNodeType;
  targets: readonly GraphNodeType[];
  /** Whether the underlying relationship record can carry a note. */
  hasNote: boolean;
  /** Whether the underlying relationship distinguishes sub-kinds via a link type. */
  hasLinkType: boolean;
  /**
   * Whether at most one such edge may exist between a given pair (per link
   * type, where there is one).
   *
   * Mirrors the unique constraints the relationship tables actually carry. It
   * matters for consistency checking: a second row between the same pair is an
   * anomaly only where the schema says a pair is unique. Approvals deliberately
   * are not — an artifact accumulates an approval history — so flagging the
   * second one would be a false alarm on entirely normal data.
   */
  uniquePerPair: boolean;
  /** What the edge means, read source → target. */
  meaning: string;
}

/**
 * **The single authoritative edge registry.**
 *
 * Every consumer — traversal, consistency checking, future impact analysis —
 * reads direction and endpoint types from here. Adding a relationship means
 * adding one entry and one resolver, not scattering knowledge across modules.
 */
export const GRAPH_EDGE_DEFINITIONS: Readonly<Record<GraphEdgeType, GraphEdgeDefinition>> = {
  STAKEHOLDER_NEED_DERIVES_REQUIREMENT: {
    type: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
    source: "STAKEHOLDER_NEED",
    targets: ["REQUIREMENT"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The requirement derives from this stakeholder need.",
  },
  REQUIREMENT_DEPENDS_ON_REQUIREMENT: {
    type: "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
    source: "REQUIREMENT",
    targets: ["REQUIREMENT"],
    hasNote: true,
    hasLinkType: true,
    uniquePerPair: true,
    meaning:
      "The source requirement decomposes to, depends on, refines, or conflicts with the target — the link type says which.",
  },
  REQUIREMENT_ALLOCATED_TO_DESIGN: {
    type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
    source: "REQUIREMENT",
    targets: ["DESIGN_ITEM"],
    hasNote: true,
    hasLinkType: true,
    uniquePerPair: true,
    meaning: "The requirement is allocated to, or satisfied by, the design item.",
  },
  REQUIREMENT_VERIFIED_BY: {
    type: "REQUIREMENT_VERIFIED_BY",
    source: "REQUIREMENT",
    targets: ["VERIFICATION_ACTIVITY"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The requirement is verified by the activity.",
  },
  REQUIREMENT_LINKED_TO_DECISION: {
    type: "REQUIREMENT_LINKED_TO_DECISION",
    source: "REQUIREMENT",
    targets: ["ENGINEERING_DECISION"],
    hasNote: true,
    hasLinkType: true,
    uniquePerPair: true,
    meaning:
      "The requirement and decision are related — the link type says whether the decision addresses the requirement or the requirement derives from the decision.",
  },
  REQUIREMENT_HAS_EVIDENCE: {
    type: "REQUIREMENT_HAS_EVIDENCE",
    source: "REQUIREMENT",
    targets: ["EVIDENCE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The evidence supports the requirement.",
  },
  DECISION_AFFECTS_DESIGN: {
    type: "DECISION_AFFECTS_DESIGN",
    source: "ENGINEERING_DECISION",
    targets: ["DESIGN_ITEM"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The decision shapes the design item.",
  },
  DECISION_AFFECTS_RISK: {
    type: "DECISION_AFFECTS_RISK",
    source: "ENGINEERING_DECISION",
    targets: ["RISK"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The decision accepts, introduces, or mitigates the risk.",
  },
  DECISION_AFFECTS_ISSUE: {
    type: "DECISION_AFFECTS_ISSUE",
    source: "ENGINEERING_DECISION",
    targets: ["ISSUE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The decision drives, or results from, the issue.",
  },
  DECISION_HAS_EVIDENCE: {
    type: "DECISION_HAS_EVIDENCE",
    source: "ENGINEERING_DECISION",
    targets: ["EVIDENCE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The evidence supports the decision.",
  },
  DECISION_HAS_ALTERNATIVE: {
    type: "DECISION_HAS_ALTERNATIVE",
    source: "ENGINEERING_DECISION",
    targets: ["DECISION_ALTERNATIVE"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "An option that was considered for this decision and not chosen.",
  },
  DECISION_HAS_ASSUMPTION: {
    type: "DECISION_HAS_ASSUMPTION",
    source: "ENGINEERING_DECISION",
    targets: ["DECISION_ASSUMPTION"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "Something that had to be true for this decision to remain sound.",
  },
  DECISION_HAS_EXPECTATION: {
    type: "DECISION_HAS_EXPECTATION",
    source: "ENGINEERING_DECISION",
    targets: ["DECISION_EXPECTATION"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "What this decision was expected to produce.",
  },
  DESIGN_CHILD_OF_DESIGN: {
    type: "DESIGN_CHILD_OF_DESIGN",
    source: "DESIGN_ITEM",
    targets: ["DESIGN_ITEM"],
    hasNote: false,
    hasLinkType: true,
    uniquePerPair: true,
    meaning:
      "The source design item contains, or depends on, the target — the link type says which. For CONTAINS the target is the child.",
  },
  DESIGN_CONNECTS_INTERFACE: {
    type: "DESIGN_CONNECTS_INTERFACE",
    source: "DESIGN_ITEM",
    targets: ["INTERFACE_DEFINITION"],
    hasNote: false,
    hasLinkType: true,
    uniquePerPair: true,
    meaning: "The design item provides, consumes, or participates in the interface.",
  },
  VERIFICATION_HAS_EVIDENCE: {
    type: "VERIFICATION_HAS_EVIDENCE",
    source: "VERIFICATION_ACTIVITY",
    targets: ["EVIDENCE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The evidence records the outcome of the verification activity.",
  },
  RISK_AFFECTS_REQUIREMENT: {
    type: "RISK_AFFECTS_REQUIREMENT",
    source: "RISK",
    targets: ["REQUIREMENT"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The risk threatens the requirement.",
  },
  RISK_AFFECTS_DESIGN: {
    type: "RISK_AFFECTS_DESIGN",
    source: "RISK",
    targets: ["DESIGN_ITEM"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The risk threatens the design item.",
  },
  ISSUE_AFFECTS_REQUIREMENT: {
    type: "ISSUE_AFFECTS_REQUIREMENT",
    source: "ISSUE",
    targets: ["REQUIREMENT"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The issue affects the requirement.",
  },
  ISSUE_AFFECTS_DESIGN: {
    type: "ISSUE_AFFECTS_DESIGN",
    source: "ISSUE",
    targets: ["DESIGN_ITEM"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The issue affects the design item.",
  },
  CHANGE_IMPACTS_OBJECT: {
    type: "CHANGE_IMPACTS_OBJECT",
    source: "CHANGE_REQUEST",
    targets: [
      "REQUIREMENT",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "VERIFICATION_ACTIVITY",
      "RISK",
      "ISSUE",
    ],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The change request affects this artifact, as asserted by its author.",
  },
  APPROVAL_RELATES_TO_OBJECT: {
    type: "APPROVAL_RELATES_TO_OBJECT",
    source: "APPROVAL",
    targets: ["REQUIREMENT", "ENGINEERING_DECISION", "CHANGE_REQUEST"],
    hasNote: false,
    hasLinkType: false,
    // An artifact accumulates an approval history over time.
    uniquePerPair: false,
    meaning: "The approval decision was recorded against this artifact.",
  },

  // --- Supplier engineering -------------------------------------------------
  //
  // Direction is stated here, once, exactly as it is for every other edge: no
  // client infers it from a table or column name. Each of these reads
  // source → target, and each corresponds to a real foreign key or join table.
  //
  // The three parent edges (provides, has qualification, qualified by) are read
  // from the child row's own foreign key, so the child's id *is* the edge's
  // provenance — the same shape the decision-memory children already use.

  SUPPLIER_PROVIDES_ITEM: {
    type: "SUPPLIER_PROVIDES_ITEM",
    source: "SUPPLIER",
    targets: ["SUPPLIED_ITEM"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "The supplier provides this item to the project.",
  },
  SUPPLIER_HAS_QUALIFICATION: {
    type: "SUPPLIER_HAS_QUALIFICATION",
    source: "SUPPLIER",
    targets: ["SUPPLIER_QUALIFICATION"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "The qualification was recorded against this supplier.",
  },
  SUPPLIED_ITEM_QUALIFIED_BY: {
    type: "SUPPLIED_ITEM_QUALIFIED_BY",
    source: "SUPPLIED_ITEM",
    targets: ["SUPPLIER_QUALIFICATION"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning:
      "The qualification establishes suitability for this specific supplied item. Absent for a SOURCE qualification, which qualifies the supplier rather than any one item.",
  },
  SUPPLIED_ITEM_ALLOCATED_TO_DESIGN: {
    type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
    source: "SUPPLIED_ITEM",
    targets: ["DESIGN_ITEM"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The design item is realised by, or incorporates, this supplied item.",
  },
  SUPPLIED_ITEM_SUPPORTS_REQUIREMENT: {
    type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
    source: "SUPPLIED_ITEM",
    targets: ["REQUIREMENT"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "Meeting the requirement depends in part on this supplied item.",
  },
  SUPPLIED_ITEM_REQUIRES_VERIFICATION: {
    type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
    source: "SUPPLIED_ITEM",
    targets: ["VERIFICATION_ACTIVITY"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The activity verifies something about this supplied item.",
  },
  SUPPLIED_ITEM_LINKED_TO_DECISION: {
    type: "SUPPLIED_ITEM_LINKED_TO_DECISION",
    source: "SUPPLIED_ITEM",
    targets: ["ENGINEERING_DECISION"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The decision selected, constrained, or rests upon this supplied item.",
  },
  SUPPLIED_ITEM_LINKED_TO_RISK: {
    type: "SUPPLIED_ITEM_LINKED_TO_RISK",
    source: "SUPPLIED_ITEM",
    targets: ["RISK"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The risk concerns this supplied item.",
  },
  SUPPLIED_ITEM_HAS_EVIDENCE: {
    type: "SUPPLIED_ITEM_HAS_EVIDENCE",
    source: "SUPPLIED_ITEM",
    targets: ["EVIDENCE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The evidence concerns this supplied item.",
  },
  SUPPLIER_QUALIFICATION_HAS_EVIDENCE: {
    type: "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
    source: "SUPPLIER_QUALIFICATION",
    targets: ["EVIDENCE"],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The evidence supports this qualification.",
  },

  // --- Design / operations drift --------------------------------------------
  //
  // Every one of these is read from a child row's own foreign key, so the
  // child's id is both the edge's provenance and the target node's id.
  //
  // Note what these edges are for. They let a reader traverse *from* engineering
  // to what was baselined and observed about it. They deliberately carry no
  // impact: a drift finding is evidence that two records disagree, not a cause
  // of change, and letting one become an impact root would make an observation
  // look like an engineering event.

  BASELINE_HAS_MEMBER: {
    type: "BASELINE_HAS_MEMBER",
    source: "ENGINEERING_BASELINE",
    targets: ["BASELINE_MEMBER"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "The baseline includes this member as part of the approved basis.",
  },
  BASELINE_MEMBER_REFERENCES_OBJECT: {
    type: "BASELINE_MEMBER_REFERENCES_OBJECT",
    source: "BASELINE_MEMBER",
    targets: [
      "REQUIREMENT",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "DECISION_EXPECTATION",
      "VERIFICATION_ACTIVITY",
      "SUPPLIED_ITEM",
      "SUPPLIER_QUALIFICATION",
    ],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning:
      "The member names the engineering object it baselined, alongside a snapshot of the state that object was in at the time.",
  },
  OBSERVATION_CONCERNS_OBJECT: {
    type: "OBSERVATION_CONCERNS_OBJECT",
    source: "OPERATIONAL_OBSERVATION",
    targets: ["DESIGN_ITEM", "DECISION_EXPECTATION", "SUPPLIED_ITEM"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The observation was recorded about this engineering object.",
  },
  DRIFT_ASSESSMENT_AGAINST_BASELINE: {
    type: "DRIFT_ASSESSMENT_AGAINST_BASELINE",
    source: "DRIFT_ASSESSMENT",
    targets: ["ENGINEERING_BASELINE"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning: "The assessment compared current state against this baseline.",
  },
  DRIFT_ASSESSMENT_HAS_FINDING: {
    type: "DRIFT_ASSESSMENT_HAS_FINDING",
    source: "DRIFT_ASSESSMENT",
    targets: ["DRIFT_FINDING"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "One comparison this assessment performed, and what it concluded.",
  },
  DRIFT_FINDING_CONCERNS_OBJECT: {
    type: "DRIFT_FINDING_CONCERNS_OBJECT",
    source: "DRIFT_FINDING",
    targets: [
      "REQUIREMENT",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "DECISION_EXPECTATION",
      "VERIFICATION_ACTIVITY",
      "SUPPLIED_ITEM",
      "SUPPLIER_QUALIFICATION",
      "OPERATIONAL_OBSERVATION",
    ],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning:
      "The object this finding concerns. Being named here means a comparison involved it — never that anything about it failed.",
  },

  // --- Certification workspace ----------------------------------------------
  //
  // A certification programme, its bases, compliance items, findings and
  // reviews all sit downstream of engineering — exactly like drift's own
  // records. Every structural edge here (parent-has-child, review-has-finding,
  // finding-concerns-subject) is inert for the same reason drift's are: none of
  // them is a cause of engineering change, and letting one propagate would make
  // certification bookkeeping look like an engineering event. The one
  // exception is COMPLIANCE_ITEM_LINKED_TO_OBJECT, which is real engineering
  // dependency read the other way around — see IMPACT_PROPAGATION.

  CERTIFICATION_PROGRAM_HAS_BASIS: {
    type: "CERTIFICATION_PROGRAM_HAS_BASIS",
    source: "CERTIFICATION_PROGRAM",
    targets: ["CERTIFICATION_BASIS"],
    hasNote: false,
    hasLinkType: false,
    // The child row is the target, so a pair cannot repeat.
    uniquePerPair: false,
    meaning: "The certification basis is tracked under this programme.",
  },
  CERTIFICATION_PROGRAM_HAS_REVIEW: {
    type: "CERTIFICATION_PROGRAM_HAS_REVIEW",
    source: "CERTIFICATION_PROGRAM",
    targets: ["CERTIFICATION_REVIEW"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "The internal certification review was evaluated for this programme.",
  },
  CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM: {
    type: "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
    source: "CERTIFICATION_BASIS",
    targets: ["COMPLIANCE_ITEM"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "The compliance item is tracked against this certification basis.",
  },
  COMPLIANCE_ITEM_LINKED_TO_OBJECT: {
    type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT",
    source: "COMPLIANCE_ITEM",
    targets: [
      "REQUIREMENT",
      "VERIFICATION_ACTIVITY",
      "EVIDENCE",
      "ENGINEERING_DECISION",
      "DESIGN_ITEM",
      "RISK",
      "ISSUE",
      "SUPPLIER_QUALIFICATION",
    ],
    hasNote: true,
    hasLinkType: false,
    uniquePerPair: true,
    meaning:
      "The compliance item's engineering basis: the requirement, verification activity, evidence, decision, design item, risk, issue or supplier qualification this obligation is tracked against.",
  },
  COMPLIANCE_ITEM_HAS_FINDING: {
    type: "COMPLIANCE_ITEM_HAS_FINDING",
    source: "COMPLIANCE_ITEM",
    targets: ["CERTIFICATION_FINDING"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "The certification finding was raised against this compliance item.",
  },
  CERTIFICATION_REVIEW_HAS_FINDING: {
    type: "CERTIFICATION_REVIEW_HAS_FINDING",
    source: "CERTIFICATION_REVIEW",
    targets: ["CERTIFICATION_REVIEW_FINDING"],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: false,
    meaning: "One condition this review evaluated, and what it concluded.",
  },
  CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT: {
    type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT",
    source: "CERTIFICATION_REVIEW_FINDING",
    targets: [
      "COMPLIANCE_ITEM",
      "REQUIREMENT",
      "VERIFICATION_ACTIVITY",
      "ENGINEERING_DECISION",
      "DESIGN_ITEM",
      "SUPPLIER_QUALIFICATION",
      "CERTIFICATION_FINDING",
      "CHANGE_REQUEST",
    ],
    hasNote: false,
    hasLinkType: false,
    uniquePerPair: true,
    meaning:
      "The object this review finding concerns. Being named here means the review evaluated it — never that it is non-compliant.",
  },
} as const;

/** Edge types whose source is the given node type. */
export function edgeTypesFrom(nodeType: GraphNodeType): GraphEdgeType[] {
  return GRAPH_EDGE_TYPES.filter((type) => GRAPH_EDGE_DEFINITIONS[type].source === nodeType);
}

/** Edge types that can point at the given node type. */
export function edgeTypesInto(nodeType: GraphNodeType): GraphEdgeType[] {
  return GRAPH_EDGE_TYPES.filter((type) =>
    GRAPH_EDGE_DEFINITIONS[type].targets.includes(nodeType),
  );
}

// --- Edges ------------------------------------------------------------------

/**
 * A canonical edge, carrying enough provenance to reconstruct where it came
 * from: the relationship record's own id, who asserted it and when.
 *
 * Nothing here is invented — `note` and `linkType` are null wherever the
 * underlying table has no such column.
 */
export interface GraphEdge {
  type: GraphEdgeType;
  source: GraphNode;
  target: GraphNode;
  /** Primary key of the relationship row this edge was read from. */
  relationshipId: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  /** Sub-kind where the relationship distinguishes one, e.g. ALLOCATED_TO. */
  linkType: string | null;
}

// --- Traversal --------------------------------------------------------------

export const GRAPH_DIRECTIONS = ["OUTBOUND", "INBOUND", "BOTH"] as const;
export type GraphDirection = (typeof GRAPH_DIRECTIONS)[number];
export const graphDirectionSchema = z.enum(GRAPH_DIRECTIONS);

/**
 * Traversal limits.
 *
 * These are ceilings, not suggestions. An unbounded traversal over a dense
 * project is a database denial-of-service dressed up as a feature request, so
 * the client may lower a limit but never raise one past these caps.
 */
export const GRAPH_LIMITS = {
  defaultMaxDepth: 3,
  maxMaxDepth: 5,
  defaultMaxNodes: 200,
  maxMaxNodes: 500,
  defaultMaxEdges: 1000,
  maxMaxEdges: 2000,
} as const;

export const graphNodeRefSchema = z.strictObject({
  type: graphNodeTypeSchema,
  id: entityIdSchema,
});

export type GraphNodeRef = z.infer<typeof graphNodeRefSchema>;

/**
 * Stable key for a node reference.
 *
 * Ids are unique per table, not globally, so the type has to be part of the
 * key — two artifacts of different types could otherwise collide in a visited
 * set and silently truncate a traversal.
 */
export function graphNodeKey(ref: GraphNodeRef): string {
  return `${ref.type}:${ref.id}`;
}

/** Stable key for an edge, used to deduplicate edges reached from both ends. */
export function graphEdgeKey(edgeType: GraphEdgeType, relationshipId: string): string {
  return `${edgeType}:${relationshipId}`;
}

/** Whether the registry permits this edge type between these two node types. */
export function isValidEdgeEndpointPair(
  edgeType: GraphEdgeType,
  sourceType: GraphNodeType,
  targetType: GraphNodeType,
): boolean {
  const definition = GRAPH_EDGE_DEFINITIONS[edgeType];
  return definition.source === sourceType && definition.targets.includes(targetType);
}

export const graphTraversalRequestSchema = z.strictObject({
  root: graphNodeRefSchema,
  direction: graphDirectionSchema.default("BOTH"),
  maxDepth: z.number().int().min(1).max(GRAPH_LIMITS.maxMaxDepth).default(GRAPH_LIMITS.defaultMaxDepth),
  maxNodes: z
    .number()
    .int()
    .min(1)
    .max(GRAPH_LIMITS.maxMaxNodes)
    .default(GRAPH_LIMITS.defaultMaxNodes),
  maxEdges: z
    .number()
    .int()
    .min(1)
    .max(GRAPH_LIMITS.maxMaxEdges)
    .default(GRAPH_LIMITS.defaultMaxEdges),
  /** Restrict which node types may be visited. Omit for all. */
  nodeTypes: z.array(graphNodeTypeSchema).min(1).optional(),
  /** Restrict which edge types may be followed. Omit for all. */
  edgeTypes: z.array(graphEdgeTypeSchema).min(1).optional(),
});

export type GraphTraversalRequest = z.infer<typeof graphTraversalRequestSchema>;

/** A visited node, with how far it was from the root and how it was reached. */
export interface TraversalNode {
  node: GraphNode;
  depth: number;
  /**
   * The chain of edges from the root to this node — the shortest one found,
   * since breadth-first reaches every node by a shortest path first. Empty for
   * the root.
   */
  path: TraversalStep[];
}

/** One hop of a path: which edge was followed, and to what. */
export interface TraversalStep {
  edgeType: GraphEdgeType;
  relationshipId: string;
  /** Which way the edge was traversed relative to its canonical direction. */
  traversed: "FORWARD" | "REVERSE";
  from: GraphNodeRef;
  to: GraphNodeRef;
}

/** Which ceiling stopped the traversal, if any. */
export interface TraversalLimits {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  /** True when the traversal stopped early because a ceiling was reached. */
  truncated: boolean;
  truncatedBy: "MAX_DEPTH" | "MAX_NODES" | "MAX_EDGES" | null;
}

export interface TraversalResult {
  root: GraphNode;
  nodes: TraversalNode[];
  edges: GraphEdge[];
  limits: TraversalLimits;
}

// --- Consistency ------------------------------------------------------------

export const GRAPH_ANOMALY_KINDS = [
  "MISSING_ENDPOINT",
  "CROSS_PROJECT_ENDPOINT",
  "MALFORMED_RELATIONSHIP",
  "DUPLICATE_EDGE",
] as const;

export type GraphAnomalyKind = (typeof GRAPH_ANOMALY_KINDS)[number];

/**
 * A reported graph anomaly.
 *
 * Reported, never repaired: silently "fixing" a relationship would destroy the
 * evidence that something wrote a bad one, and impact analysis built on a
 * quietly-corrected graph is worse than one built on a graph known to be
 * broken.
 */
export interface GraphAnomaly {
  kind: GraphAnomalyKind;
  edgeType: GraphEdgeType;
  relationshipId: string;
  detail: string;
}

export interface GraphConsistencyReport {
  projectId: string;
  checkedEdgeTypes: GraphEdgeType[];
  anomalies: GraphAnomaly[];
  /** Total canonical edges examined. */
  edgesChecked: number;
}
