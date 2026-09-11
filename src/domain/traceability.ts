import { z } from "zod";
import type { GraphEdgeType, GraphNodeType } from "./graph";

/**
 * The Traceability workspace's read-only view over the canonical engineering
 * graph.
 *
 * This file adds no graph model, no edge types, and no traversal logic —
 * `EngineeringGraphService` and the registry in `graph.ts` already do
 * everything the workspace needs. What is missing, and all this file
 * provides, is workspace-facing metadata: which node types have a genuine
 * project-wide "list everything of this type" capability to build a picker
 * from, why the rest do not, human-readable labels derived from the
 * canonical type names, and which node types have a real detail page to
 * navigate into.
 */

// --- Selectable roots --------------------------------------------------------

/**
 * Graph node types the workspace's object picker offers as a starting point.
 *
 * A type appears here only if some existing service already exposes a
 * project-wide listing for it — nothing new was written to query for these.
 * Everything excluded remains fully explorable once *reached* by following a
 * relationship from a supported root: `EngineeringGraphService.getNode`
 * resolves every one of the 29 registered node types uniformly, regardless of
 * whether it can also serve as a flat picker's root. See
 * {@link TRACEABILITY_UNSELECTABLE_REASONS} for exactly why each remaining
 * type is left out.
 */
export const TRACEABILITY_SELECTABLE_NODE_TYPES = [
  "REQUIREMENT",
  "STAKEHOLDER_NEED",
  "DESIGN_ITEM",
  "VERIFICATION_ACTIVITY",
  "ENGINEERING_DECISION",
  "RISK",
  "ISSUE",
  "CHANGE_REQUEST",
  "SUPPLIER",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
  "ENGINEERING_BASELINE",
  "OPERATIONAL_OBSERVATION",
  "DRIFT_ASSESSMENT",
  "CERTIFICATION_BASIS",
  "COMPLIANCE_ITEM",
  "CERTIFICATION_REVIEW",
] as const satisfies readonly GraphNodeType[];

export type TraceabilitySelectableNodeType = (typeof TRACEABILITY_SELECTABLE_NODE_TYPES)[number];

export const traceabilityNodeTypeSchema = z.enum(
  TRACEABILITY_SELECTABLE_NODE_TYPES as unknown as [
    TraceabilitySelectableNodeType,
    ...TraceabilitySelectableNodeType[],
  ],
);

/**
 * Why every other graph node type is not offered as a traceability root.
 *
 * Each reason names the real, specific gap — a missing project-wide listing,
 * a listing that is scoped to a parent record instead, or (for `PROJECT`) an
 * absence of any registered edge at all — rather than a generic "not
 * supported yet". Nothing here is asserted without having been checked
 * against the actual repository and service code.
 */
export const TRACEABILITY_UNSELECTABLE_REASONS: Readonly<Partial<Record<GraphNodeType, string>>> = {
  PROJECT:
    "The project itself has no edges registered in GRAPH_EDGE_DEFINITIONS — nothing currently " +
    "connects to it as a source or a target, so it would always show an empty neighborhood.",
  DECISION_ALTERNATIVE:
    "Alternatives are listed only per decision, not project-wide. Reachable as an outbound " +
    "neighbor of the Engineering Decision that considered it.",
  DECISION_ASSUMPTION:
    "Assumptions are listed only per decision, not project-wide. Reachable as an outbound " +
    "neighbor of the Engineering Decision it was made for.",
  DECISION_EXPECTATION:
    "Expectations are listed only per decision, not project-wide. Reachable as an outbound " +
    "neighbor of the Engineering Decision it was made for.",
  INTERFACE_DEFINITION:
    "No project-wide listing exists; interfaces are managed inline on the Design Item that " +
    "connects to them. Reachable as an outbound neighbor of that Design Item.",
  EVIDENCE:
    "No project-wide listing service exists, and evidence has no standalone detail page. " +
    "Reachable as a neighbor of the requirement, decision, verification activity or supplied " +
    "item it supports.",
  APPROVAL:
    "No listing service exists; approvals are shown as history on the object they were recorded " +
    "against, not as a project-wide list. Reachable as an inbound neighbor of that object.",
  BASELINE_MEMBER:
    "Members are listed only per baseline, not project-wide. Reachable as an outbound neighbor " +
    "of the Engineering Baseline that includes it.",
  DRIFT_FINDING:
    "Findings are listed only within their own assessment, not project-wide. Reachable as an " +
    "outbound neighbor of the Drift Assessment that recorded it.",
  CERTIFICATION_PROGRAM:
    "A project has at most one certification program and there is no list-many API for it — " +
    "getProgram returns the single program or null. Reachable as the inbound neighbor of any of " +
    "its certification bases.",
  CERTIFICATION_FINDING:
    "Findings are listed only per compliance item, not project-wide. Reachable as an outbound " +
    "neighbor of the Compliance Item it was raised against.",
  CERTIFICATION_REVIEW_FINDING:
    "Findings are listed only within their own review, not project-wide. Reachable as an " +
    "outbound neighbor of the Certification Review that recorded it.",
};

/** One object a picker can offer for a given selectable node type. */
export interface TraceabilityRootOption {
  id: string;
  /** Human-facing key where the object has one; null for the handful of types identified by state and time instead. */
  identifier: string | null;
  label: string;
}

// --- Display helpers ----------------------------------------------------------

/**
 * Turns a SCREAMING_SNAKE_CASE registry constant into a readable phrase —
 * "ENGINEERING_DECISION" to "Engineering decision", "RISK_AFFECTS_DESIGN" to
 * "Risk affects design". Every node and edge type in the registry was named
 * to read correctly this way, so no hand-maintained label table is kept
 * alongside it to drift out of sync.
 */
export function humanizeGraphToken(token: string): string {
  const words = token.toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? capitalize(word) : word)).join(" ");
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

export function graphNodeTypeLabel(type: GraphNodeType): string {
  return humanizeGraphToken(type);
}

export function graphEdgeTypeLabel(type: GraphEdgeType): string {
  return humanizeGraphToken(type);
}

// --- Detail routes --------------------------------------------------------------

/**
 * Real detail pages a traceability result can link out to, keyed by node
 * type. Every entry mirrors an actual dynamic route under
 * `src/app/(workspace)/projects/[projectId]` — nothing here is a guess at a
 * route that might exist.
 */
const DETAIL_ROUTE_BUILDERS: Partial<Record<GraphNodeType, (projectId: string, id: string) => string>> = {
  REQUIREMENT: (projectId, id) => `/projects/${projectId}/requirements/${id}`,
  STAKEHOLDER_NEED: (projectId, id) => `/projects/${projectId}/stakeholder-needs/${id}`,
  DESIGN_ITEM: (projectId, id) => `/projects/${projectId}/design-items/${id}`,
  VERIFICATION_ACTIVITY: (projectId, id) => `/projects/${projectId}/verification/${id}`,
  ENGINEERING_DECISION: (projectId, id) => `/projects/${projectId}/decisions/${id}`,
  CHANGE_REQUEST: (projectId, id) => `/projects/${projectId}/changes/${id}`,
  RISK: (projectId, id) => `/projects/${projectId}/risks/${id}`,
  ISSUE: (projectId, id) => `/projects/${projectId}/issues/${id}`,
  SUPPLIER: (projectId, id) => `/projects/${projectId}/suppliers/${id}`,
  SUPPLIED_ITEM: (projectId, id) => `/projects/${projectId}/supplied-items/${id}`,
  SUPPLIER_QUALIFICATION: (projectId, id) => `/projects/${projectId}/supplier-qualifications/${id}`,
  ENGINEERING_BASELINE: (projectId, id) => `/projects/${projectId}/baselines/${id}`,
  COMPLIANCE_ITEM: (projectId, id) => `/projects/${projectId}/certification/items/${id}`,
};

/**
 * The real detail route for a node, or null when this type has no standalone
 * detail page to navigate to. Selectability and having a detail route are
 * independent: `CERTIFICATION_BASIS`, `CERTIFICATION_REVIEW`,
 * `OPERATIONAL_OBSERVATION` and `DRIFT_ASSESSMENT` are all selectable roots
 * with no detail page of their own, and `PROJECT` has a detail page but is
 * never reachable as a graph node at all. Callers must treat null as "do not
 * render a link", never fabricate one.
 */
export function traceabilityDetailRoute(
  type: GraphNodeType,
  projectId: string,
  id: string,
): string | null {
  const build = DETAIL_ROUTE_BUILDERS[type];
  return build ? build(projectId, id) : null;
}
