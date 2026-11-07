import { z } from "zod";
import {
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_EDGE_TYPES,
  type GraphEdgeType,
  type GraphNodeType,
  type TraversalStep,
  graphNodeRefSchema,
} from "./graph";
import { entityIdSchema } from "./shared/identifier";

/**
 * Deterministic change-impact analysis.
 *
 * The engine answers one question: *given this change and the relationships
 * currently recorded, what objects are reachable and therefore potentially
 * affected?* It answers it by walking the existing engineering graph under an
 * explicit propagation policy, and it never converts connectivity into
 * certainty.
 *
 * Three things this is deliberately not:
 *
 *  - **Not a prediction.** Nothing here is probabilistic. The same graph, the
 *    same change and the same engine version produce the same findings, in the
 *    same order, with the same reasons.
 *  - **Not a score.** There is no severity number, no confidence, no risk
 *    rating. A fabricated number would be read as a measurement.
 *  - **Not a verdict.** Reaching a verification activity does not mean
 *    verification failed; reaching an assumption does not mean the assumption
 *    is broken. Those are separate engines, and V1 says so explicitly through
 *    `NOT_EVALUATED` markers rather than guessing.
 *
 * Everything here is Prisma-free.
 */

/**
 * Which rule set produced a result.
 *
 * Findings are only comparable within a version. Bump this whenever the
 * propagation policy or classification rules change, so an old analysis is
 * never silently compared against new semantics.
 *
 * `2` added the supplier engineering edges to the propagation policy. `3` added
 * the certification workspace edges — one of them, `COMPLIANCE_ITEM_LINKED_TO_OBJECT`,
 * carries context. Both bumps are purely additive — no existing edge's rule
 * changed — but the set of relationships the engine walks is part of what an
 * analysis *means*, so a result produced before these records could be reached
 * is not the same statement as one produced after, and it is labelled
 * accordingly rather than quietly reinterpreted.
 */
export const IMPACT_ENGINE_VERSION = "3";

// --- Statuses ---------------------------------------------------------------

/**
 * Execution state of a run.
 *
 * `NOT_RUN` is never persisted — it is what a report says when no analysis
 * exists yet, which is different from an analysis that found nothing.
 */
export const IMPACT_ANALYSIS_STATUSES = ["NOT_RUN", "RUNNING", "COMPLETED", "FAILED"] as const;
export type ImpactAnalysisStatus = (typeof IMPACT_ANALYSIS_STATUSES)[number];

/**
 * Whether a completed analysis still describes the current state.
 *
 * Deliberately separate from execution state: a `COMPLETED` analysis is a
 * finished run, which says nothing about whether the graph has moved since.
 * Freshness is *derived* by comparing fingerprints at read time, never stored
 * as a mutable flag — the analysis record itself is immutable.
 */
export const IMPACT_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type ImpactFreshness = (typeof IMPACT_FRESHNESS)[number];

/**
 * What kind of reachability a finding represents.
 *
 * `DIRECT` — the object was explicitly declared as impacted on the change.
 * `DOWNSTREAM` — reached by propagation, staying inside one artifact domain.
 * `CROSS_DOMAIN` — reached by propagation, having crossed a domain boundary.
 *   Kept separate from `DOWNSTREAM` because crossing from requirement to design
 *   to verification is the case an engineer most needs to notice, and burying
 *   it in a general bucket loses that.
 * `UPSTREAM_CONTEXT` — surfaced by walking *against* an edge. Context, not
 *   impact: the engine is showing what surrounds the change, not claiming the
 *   object is affected.
 * `UNKNOWN` — the engine could not classify it, e.g. a declared target that
 *   does not resolve inside the project.
 */
export const IMPACT_CLASSIFICATIONS = [
  "DIRECT",
  "DOWNSTREAM",
  "CROSS_DOMAIN",
  "UPSTREAM_CONTEXT",
  "UNKNOWN",
] as const;
export type ImpactClassification = (typeof IMPACT_CLASSIFICATIONS)[number];

/**
 * What the engine is willing to assert about a finding.
 *
 * There is no `CONFIRMED`. Confirmation would require evidence this system does
 * not yet gather, and a status that implies it would be a lie told in a field
 * name.
 */
export const IMPACT_FINDING_STATUSES = [
  "POTENTIALLY_AFFECTED",
  "NOT_EVALUATED",
  "UNKNOWN",
] as const;
export type ImpactFindingStatus = (typeof IMPACT_FINDING_STATUSES)[number];

/**
 * Precedence when the same object is reached more than once.
 *
 * A declared object that is *also* discovered by propagation stays `DIRECT`:
 * what the engineer asserted outranks what the walk inferred. Below that,
 * crossing a domain boundary outranks staying inside one, and any propagated
 * finding outranks mere context.
 */
const CLASSIFICATION_PRECEDENCE: Readonly<Record<ImpactClassification, number>> = {
  DIRECT: 5,
  CROSS_DOMAIN: 4,
  DOWNSTREAM: 3,
  UPSTREAM_CONTEXT: 2,
  UNKNOWN: 1,
};

/** The stronger of two classifications for the same object. */
export function strongerClassification(
  a: ImpactClassification,
  b: ImpactClassification,
): ImpactClassification {
  return CLASSIFICATION_PRECEDENCE[a] >= CLASSIFICATION_PRECEDENCE[b] ? a : b;
}

/** The status the engine is willing to assert for a given classification. */
export function statusForClassification(
  classification: ImpactClassification,
): ImpactFindingStatus {
  switch (classification) {
    case "DIRECT":
    case "DOWNSTREAM":
    case "CROSS_DOMAIN":
      return "POTENTIALLY_AFFECTED";
    case "UPSTREAM_CONTEXT":
      // Surfaced for context. V1 deliberately does not assess whether these are
      // affected, and says so rather than implying they are.
      return "NOT_EVALUATED";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

// --- Artifact domains -------------------------------------------------------

/**
 * The domain each node type belongs to.
 *
 * Crossing between these is what makes a finding cross-domain. Decision memory
 * records sit with their decision, and design items sit with the interfaces
 * they connect, because moving between those is not a domain transition an
 * engineer needs flagging.
 */
export const ARTIFACT_DOMAINS: Readonly<Record<GraphNodeType, string>> = {
  PROJECT: "PROJECT",
  STAKEHOLDER_NEED: "NEED",
  REQUIREMENT: "REQUIREMENT",
  ENGINEERING_DECISION: "DECISION",
  DECISION_ALTERNATIVE: "DECISION",
  DECISION_ASSUMPTION: "DECISION",
  DECISION_EXPECTATION: "DECISION",
  DESIGN_ITEM: "DESIGN",
  INTERFACE_DEFINITION: "DESIGN",
  VERIFICATION_ACTIVITY: "VERIFICATION",
  RISK: "RISK",
  ISSUE: "RISK",
  CHANGE_REQUEST: "CHANGE",
  EVIDENCE: "EVIDENCE",
  APPROVAL: "GOVERNANCE",
  // Supplier records form their own domain, so a change that starts at a
  // supplied item and reaches design or requirements is reported as
  // CROSS_DOMAIN. That is the whole point: an engineer needs to see that a
  // supply-side change left the supply side. A qualification sits with the
  // supplier rather than with EVIDENCE — it is a statement about suitability,
  // not the document that supports it.
  SUPPLIER: "SUPPLY",
  SUPPLIED_ITEM: "SUPPLY",
  SUPPLIER_QUALIFICATION: "SUPPLY",
  // Drift records are observations *about* engineering, not engineering. They
  // form their own domain so that if one ever were reached, it would be
  // unmistakably flagged as having left the engineering record — though in
  // practice none of their edges propagate at all.
  ENGINEERING_BASELINE: "DRIFT",
  BASELINE_MEMBER: "DRIFT",
  OPERATIONAL_OBSERVATION: "DRIFT",
  DRIFT_ASSESSMENT: "DRIFT",
  DRIFT_FINDING: "DRIFT",
  // Certification records form their own domain for the same reason drift's
  // do: reaching one from a changed requirement or design item is a genuine
  // domain crossing an engineer needs to see, even though the one edge that
  // can reach them (COMPLIANCE_ITEM_LINKED_TO_OBJECT) only ever does so as
  // context, never as propagated impact.
  CERTIFICATION_PROGRAM: "CERTIFICATION",
  CERTIFICATION_BASIS: "CERTIFICATION",
  COMPLIANCE_ITEM: "CERTIFICATION",
  CERTIFICATION_FINDING: "CERTIFICATION",
  CERTIFICATION_REVIEW: "CERTIFICATION",
  CERTIFICATION_REVIEW_FINDING: "CERTIFICATION",
};

export function artifactDomain(nodeType: GraphNodeType): string {
  return ARTIFACT_DOMAINS[nodeType];
}

/** Whether reaching `to` from `from` leaves the artifact domain it started in. */
export function crossesDomain(from: GraphNodeType, to: GraphNodeType): boolean {
  return artifactDomain(from) !== artifactDomain(to);
}

// --- Propagation policy -----------------------------------------------------

/**
 * How one edge type behaves under impact analysis.
 *
 * Read against the edge's canonical direction, which the graph registry fixes
 * once: `propagates` means a change at the source may affect the target;
 * `context` means that standing at the target, the source is worth showing
 * without claiming it is affected.
 */
export interface ImpactPropagationRule {
  type: GraphEdgeType;
  /** Traversed outbound, multi-hop. Produces DOWNSTREAM / CROSS_DOMAIN findings. */
  propagates: boolean;
  /** Traversed inbound, one hop from a root. Produces UPSTREAM_CONTEXT findings. */
  context: boolean;
  /** Why the rule is what it is, in engineering terms. */
  rationale: string;
}

/**
 * **The single authoritative propagation policy.**
 *
 * One entry per canonical edge type, and nothing outside this table decides
 * whether an edge carries impact. The graph registry says what an edge *means*;
 * this says what an impact analysis should *do* with it. Scattering these
 * decisions across the service is how a policy quietly becomes inconsistent.
 *
 * Two edges carry no impact at all:
 *
 *  - `CHANGE_IMPACTS_OBJECT` is excluded because it is the declared-impact edge
 *    itself. The roots *are* its targets, so traversing it would produce the
 *    change pointing at its own scope, and following it inbound would drag in
 *    every other change touching the same object — a different feature.
 *  - `APPROVAL_RELATES_TO_OBJECT` does not propagate forward: changing an
 *    approval record does not alter the artifact it approved. It is context in
 *    the other direction, which is where it earns its place.
 */
export const IMPACT_PROPAGATION: Readonly<Record<GraphEdgeType, ImpactPropagationRule>> = {
  STAKEHOLDER_NEED_DERIVES_REQUIREMENT: {
    type: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
    propagates: true,
    context: true,
    rationale: "A changed need reaches the requirements derived from it.",
  },
  REQUIREMENT_DEPENDS_ON_REQUIREMENT: {
    type: "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
    propagates: true,
    context: true,
    rationale: "A changed requirement reaches the requirements decomposed from or depending on it.",
  },
  REQUIREMENT_ALLOCATED_TO_DESIGN: {
    type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
    propagates: true,
    context: true,
    rationale: "A changed requirement reaches the design it is allocated to.",
  },
  REQUIREMENT_VERIFIED_BY: {
    type: "REQUIREMENT_VERIFIED_BY",
    propagates: true,
    context: true,
    rationale: "A changed requirement reaches the activity that verifies it — the verification may no longer show what it showed.",
  },
  REQUIREMENT_LINKED_TO_DECISION: {
    type: "REQUIREMENT_LINKED_TO_DECISION",
    propagates: true,
    context: true,
    rationale: "A changed requirement reaches the decision taken to address it.",
  },
  REQUIREMENT_HAS_EVIDENCE: {
    type: "REQUIREMENT_HAS_EVIDENCE",
    propagates: true,
    context: true,
    rationale: "Evidence gathered for a requirement may no longer apply once it changes.",
  },
  DECISION_AFFECTS_DESIGN: {
    type: "DECISION_AFFECTS_DESIGN",
    propagates: true,
    context: true,
    rationale: "A changed decision reaches the design it shaped.",
  },
  DECISION_AFFECTS_RISK: {
    type: "DECISION_AFFECTS_RISK",
    propagates: true,
    context: true,
    rationale: "A changed decision reaches the risk it accepted, introduced or mitigated.",
  },
  DECISION_AFFECTS_ISSUE: {
    type: "DECISION_AFFECTS_ISSUE",
    propagates: true,
    context: true,
    rationale: "A changed decision reaches the issue it drove or resolved.",
  },
  DECISION_HAS_EVIDENCE: {
    type: "DECISION_HAS_EVIDENCE",
    propagates: true,
    context: true,
    rationale: "Evidence supporting a decision may no longer apply once it changes.",
  },
  DECISION_HAS_ALTERNATIVE: {
    type: "DECISION_HAS_ALTERNATIVE",
    propagates: true,
    context: true,
    rationale: "A rejected alternative is worth re-reading when its decision is disturbed.",
  },
  DECISION_HAS_ASSUMPTION: {
    type: "DECISION_HAS_ASSUMPTION",
    propagates: true,
    context: true,
    rationale: "An assumption behind a disturbed decision is exactly what someone must re-check — the engine surfaces it and stops there.",
  },
  DECISION_HAS_EXPECTATION: {
    type: "DECISION_HAS_EXPECTATION",
    propagates: true,
    context: true,
    rationale: "What a decision was expected to produce is in scope when the decision is disturbed.",
  },
  DESIGN_CHILD_OF_DESIGN: {
    type: "DESIGN_CHILD_OF_DESIGN",
    propagates: true,
    context: true,
    rationale: "A changed design item reaches what it contains or what depends on it.",
  },
  DESIGN_CONNECTS_INTERFACE: {
    type: "DESIGN_CONNECTS_INTERFACE",
    propagates: true,
    context: true,
    rationale: "A changed design item reaches the interfaces it participates in.",
  },
  VERIFICATION_HAS_EVIDENCE: {
    type: "VERIFICATION_HAS_EVIDENCE",
    propagates: true,
    context: true,
    rationale: "Evidence recording a verification outcome is reached when that activity is disturbed.",
  },
  RISK_AFFECTS_REQUIREMENT: {
    type: "RISK_AFFECTS_REQUIREMENT",
    propagates: true,
    context: true,
    rationale: "The edge states the risk threatens the requirement, so a change to the risk reaches it; from the requirement, the risk is context.",
  },
  RISK_AFFECTS_DESIGN: {
    type: "RISK_AFFECTS_DESIGN",
    propagates: true,
    context: true,
    rationale: "As for requirements: forward is the threat, inbound is context.",
  },
  ISSUE_AFFECTS_REQUIREMENT: {
    type: "ISSUE_AFFECTS_REQUIREMENT",
    propagates: true,
    context: true,
    rationale: "An issue affecting a requirement carries forward; from the requirement it is context.",
  },
  ISSUE_AFFECTS_DESIGN: {
    type: "ISSUE_AFFECTS_DESIGN",
    propagates: true,
    context: true,
    rationale: "As for requirements: forward is the effect, inbound is context.",
  },
  CHANGE_IMPACTS_OBJECT: {
    type: "CHANGE_IMPACTS_OBJECT",
    propagates: false,
    context: false,
    rationale: "This is the declared-impact edge itself. Its targets are the analysis roots, so traversing it would restate the change's own scope; following it inbound would pull in unrelated changes.",
  },
  APPROVAL_RELATES_TO_OBJECT: {
    type: "APPROVAL_RELATES_TO_OBJECT",
    propagates: false,
    context: true,
    rationale: "Changing an approval record does not alter what it approved, but an approval standing against a changed object is worth seeing.",
  },

  // --- Supplier engineering -------------------------------------------------
  //
  // Every one of these propagates because each is a genuine engineering
  // dependency: the product relies on the supplied item, so a change to it
  // reaches what relies on it. Note what is *not* here — there is no commercial
  // relationship in the graph at all, so there is no edge that could carry
  // impact without an engineering consequence behind it.

  SUPPLIER_PROVIDES_ITEM: {
    type: "SUPPLIER_PROVIDES_ITEM",
    propagates: true,
    context: true,
    rationale:
      "A change at the supplier — who they are, whether the project still relies on them — reaches everything they supply, which is how a supplier-level change finds its engineering consequences at all. Inbound, the supplier is context for the item.",
  },
  SUPPLIER_HAS_QUALIFICATION: {
    type: "SUPPLIER_HAS_QUALIFICATION",
    propagates: true,
    context: true,
    rationale:
      "A qualification is held against a supplier, so a change to the supplier reaches it. The engine surfaces the qualification and stops: it does not conclude the qualification is invalid, because a change is not a failure.",
  },
  SUPPLIED_ITEM_QUALIFIED_BY: {
    type: "SUPPLIED_ITEM_QUALIFIED_BY",
    propagates: true,
    context: true,
    rationale:
      "If the item changes, the basis on which it was accepted is exactly what someone must re-read. Surfaced, never re-judged.",
  },
  SUPPLIED_ITEM_ALLOCATED_TO_DESIGN: {
    type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
    propagates: true,
    context: true,
    rationale:
      "A changed supplied item reaches the design that incorporates it — the central supplier-impact path, and the reason supplier records are in this graph.",
  },
  SUPPLIED_ITEM_SUPPORTS_REQUIREMENT: {
    type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
    propagates: true,
    context: true,
    rationale:
      "A requirement met in part by a supplied item may no longer be met once that item changes.",
  },
  SUPPLIED_ITEM_REQUIRES_VERIFICATION: {
    type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
    propagates: true,
    context: true,
    rationale:
      "Verification performed against a supplied item may no longer show what it showed once the item changes. Reaching the activity does not mean it failed — the verification engines own that question.",
  },
  SUPPLIED_ITEM_LINKED_TO_DECISION: {
    type: "SUPPLIED_ITEM_LINKED_TO_DECISION",
    propagates: true,
    context: true,
    rationale:
      "A decision that selected or rests upon this item is disturbed when the item changes, and from there the walk reaches the design that decision shaped.",
  },
  SUPPLIED_ITEM_LINKED_TO_RISK: {
    type: "SUPPLIED_ITEM_LINKED_TO_RISK",
    propagates: true,
    context: true,
    rationale:
      "A risk recorded against this item is reached when the item changes. The engine does not re-rank the risk; the domain records no severity to rank.",
  },
  SUPPLIED_ITEM_HAS_EVIDENCE: {
    type: "SUPPLIED_ITEM_HAS_EVIDENCE",
    propagates: true,
    context: true,
    rationale: "Evidence gathered about a supplied item may no longer apply once it changes.",
  },
  SUPPLIER_QUALIFICATION_HAS_EVIDENCE: {
    type: "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
    propagates: true,
    context: true,
    rationale:
      "Evidence supporting a qualification is reached when the qualification is disturbed.",
  },

  // --- Design / operations drift --------------------------------------------
  //
  // **None of these propagate, and none carry context.** This is the one place
  // in the policy where a whole family of edges is inert, and it is deliberate.
  //
  // A baseline records what was approved; an observation records what somebody
  // saw; a drift finding records that those two disagree. None of them *causes*
  // an engineering change, so none can carry impact forward. And none is
  // admitted as context either: pulling every observation ever recorded about a
  // design item into the impact report for an unrelated change would bury the
  // change's actual reach under operational history.
  //
  // The practical consequence is the important one — a drift finding can never
  // become an impact root, and the change engine remains the change engine.

  BASELINE_HAS_MEMBER: {
    type: "BASELINE_HAS_MEMBER",
    propagates: false,
    context: false,
    rationale:
      "A baseline is a fixed reference point. Changing an object does not change what was baselined about it — that divergence is precisely what drift detection exists to report, and it would be destroyed by treating the baseline as something a change reaches.",
  },
  BASELINE_MEMBER_REFERENCES_OBJECT: {
    type: "BASELINE_MEMBER_REFERENCES_OBJECT",
    propagates: false,
    context: false,
    rationale:
      "The member's snapshot is immutable by design. An impact analysis that walked here would suggest a change reaches the historical record of what was approved, which is exactly backwards.",
  },
  OBSERVATION_CONCERNS_OBJECT: {
    type: "OBSERVATION_CONCERNS_OBJECT",
    propagates: false,
    context: false,
    rationale:
      "An observation is a report of what happened, not a cause of change. A change to a design item does not alter what somebody already measured, and surfacing every past observation as context for an unrelated change would drown the finding set in operational history.",
  },
  DRIFT_ASSESSMENT_AGAINST_BASELINE: {
    type: "DRIFT_ASSESSMENT_AGAINST_BASELINE",
    propagates: false,
    context: false,
    rationale: "An assessment is an immutable record of one comparison at one moment.",
  },
  DRIFT_ASSESSMENT_HAS_FINDING: {
    type: "DRIFT_ASSESSMENT_HAS_FINDING",
    propagates: false,
    context: false,
    rationale: "Findings belong to their assessment and are never reached by a change.",
  },
  DRIFT_FINDING_CONCERNS_OBJECT: {
    type: "DRIFT_FINDING_CONCERNS_OBJECT",
    propagates: false,
    context: false,
    rationale:
      "The edge that must stay inert. A drift finding is evidence that two records disagree; letting it act as an impact root would turn 'somebody measured something unexpected' into 'an engineering change is propagating', which is a claim nobody made.",
  },

  // --- Certification workspace -----------------------------------------------
  //
  // Every structural certification edge is inert, for the same reason drift's
  // are: a certification programme, basis, finding or review is a record
  // *about* engineering, not an engineering object, and none of them causes a
  // change. The one exception is COMPLIANCE_ITEM_LINKED_TO_OBJECT, which is a
  // real dependency — read backwards. A compliance item cannot cause an
  // engineering change (certification stays downstream of engineering, by
  // design), so it never propagates forward. But the requirement, design item,
  // decision, verification activity, evidence, risk, issue or supplier
  // qualification it depends on genuinely can change, and when it does the
  // compliance item tracking it needs to be visible — as context, never as an
  // assertion that the item is non-compliant.

  CERTIFICATION_PROGRAM_HAS_BASIS: {
    type: "CERTIFICATION_PROGRAM_HAS_BASIS",
    propagates: false,
    context: false,
    rationale:
      "A certification basis is a fixed reference record, not something a programme-level edit reaches or that reaches upward.",
  },
  CERTIFICATION_PROGRAM_HAS_REVIEW: {
    type: "CERTIFICATION_PROGRAM_HAS_REVIEW",
    propagates: false,
    context: false,
    rationale: "A review is an immutable record of one evaluation; it is never reached by, nor does it reach, a change.",
  },
  CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM: {
    type: "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
    propagates: false,
    context: false,
    rationale:
      "A compliance item's existence under a basis is certification bookkeeping, not an engineering dependency the impact engine should walk.",
  },
  COMPLIANCE_ITEM_LINKED_TO_OBJECT: {
    type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT",
    propagates: false,
    context: true,
    rationale:
      "A compliance item never causes an engineering change — certification stays downstream of engineering, so this never propagates forward. But it is real engineering dependency read the other way: when the requirement, design item, decision, verification activity, evidence, risk, issue or supplier qualification it tracks changes, the compliance item is worth seeing as context. It is never read as the item having become non-compliant.",
  },
  COMPLIANCE_ITEM_HAS_FINDING: {
    type: "COMPLIANCE_ITEM_HAS_FINDING",
    propagates: false,
    context: false,
    rationale:
      "A certification finding is evidence of a compliance gap, not an engineering cause — the same reasoning that keeps a drift finding inert.",
  },
  CERTIFICATION_FINDING_HAS_EVIDENCE: {
    type: "CERTIFICATION_FINDING_HAS_EVIDENCE",
    propagates: false,
    context: false,
    rationale:
      "Naming evidence as a finding's supporting record is downstream bookkeeping, not an engineering cause — the same reasoning that keeps every other certification-structural edge inert.",
  },
  CERTIFICATION_REVIEW_HAS_FINDING: {
    type: "CERTIFICATION_REVIEW_HAS_FINDING",
    propagates: false,
    context: false,
    rationale: "Review findings belong to their review and are never reached by, nor reach, a change.",
  },
  CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT: {
    type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT",
    propagates: false,
    context: false,
    rationale:
      "The edge that must stay inert, exactly like DRIFT_FINDING_CONCERNS_OBJECT: a review finding is evidence the review engine produced, not a cause of change, and pulling every review finding into context for any touched object would drown genuine impact findings under review history.",
  },
};

/** Edge types walked outbound as downstream impact. Sorted, for determinism. */
export const PROPAGATING_EDGE_TYPES: readonly GraphEdgeType[] = GRAPH_EDGE_TYPES.filter(
  (type) => IMPACT_PROPAGATION[type].propagates,
)
  .slice()
  .sort();

/** Edge types walked inbound, one hop, as context. Sorted, for determinism. */
export const CONTEXT_EDGE_TYPES: readonly GraphEdgeType[] = GRAPH_EDGE_TYPES.filter(
  (type) => IMPACT_PROPAGATION[type].context,
)
  .slice()
  .sort();

// --- Basis markers ----------------------------------------------------------

/**
 * Why a finding is in the report, and what the engine deliberately did not
 * decide about it.
 *
 * The `*_NOT_EVALUATED` markers exist so that a reader can tell "we did not
 * look" apart from "we looked and it was fine". Missing evidence is not a
 * failure, and this is where that distinction is recorded.
 */
export const IMPACT_BASIS_MARKERS = [
  "DECLARED_IMPACT",
  "GRAPH_PROPAGATION",
  "UPSTREAM_CONTEXT_EDGE",
  "DOMAIN_BOUNDARY_CROSSED",
  "ROOT_NOT_RESOLVABLE",
  "ASSUMPTION_PRESENT",
  "ASSUMPTION_VALIDITY_NOT_EVALUATED",
  "EXPECTATION_PRESENT",
  "EXPECTATION_OUTCOME_NOT_EVALUATED",
  "ALTERNATIVE_PRESENT",
  "VERIFICATION_ACTIVITY_AFFECTED",
  "VERIFICATION_OUTCOME_NOT_EVALUATED",
  "EVIDENCE_IN_PATH",
  "APPROVAL_IN_PATH",
  "SUPPLIER_IN_PATH",
  "SUPPLIED_ITEM_AFFECTED",
  "QUALIFICATION_PRESENT",
  "QUALIFICATION_VALIDITY_NOT_EVALUATED",
  "CERTIFICATION_ITEM_PRESENT",
  "CERTIFICATION_ITEM_DISPOSITION_NOT_EVALUATED",
] as const;

export type ImpactBasisMarker = (typeof IMPACT_BASIS_MARKERS)[number];

/**
 * Markers implied by what kind of object the finding is.
 *
 * Each pairs a "this is here" marker with an explicit "and we did not judge it"
 * marker, because the whole point is to hand the object to a human — or to a
 * later engine — without pretending to have assessed it.
 */
export function basisForNodeType(nodeType: GraphNodeType): ImpactBasisMarker[] {
  switch (nodeType) {
    case "DECISION_ASSUMPTION":
      return ["ASSUMPTION_PRESENT", "ASSUMPTION_VALIDITY_NOT_EVALUATED"];
    case "DECISION_EXPECTATION":
      return ["EXPECTATION_PRESENT", "EXPECTATION_OUTCOME_NOT_EVALUATED"];
    case "DECISION_ALTERNATIVE":
      return ["ALTERNATIVE_PRESENT"];
    case "VERIFICATION_ACTIVITY":
      return ["VERIFICATION_ACTIVITY_AFFECTED", "VERIFICATION_OUTCOME_NOT_EVALUATED"];
    case "EVIDENCE":
      return ["EVIDENCE_IN_PATH"];
    case "APPROVAL":
      return ["APPROVAL_IN_PATH"];
    case "SUPPLIER":
      return ["SUPPLIER_IN_PATH"];
    case "SUPPLIED_ITEM":
      return ["SUPPLIED_ITEM_AFFECTED"];
    case "SUPPLIER_QUALIFICATION":
      // The pairing matters more here than anywhere else. Reaching a
      // qualification means a change disturbed what it was granted against — it
      // does **not** mean the qualification lapsed, and this system will never
      // say that it did. A person decides; the engine hands them the record.
      return ["QUALIFICATION_PRESENT", "QUALIFICATION_VALIDITY_NOT_EVALUATED"];
    case "COMPLIANCE_ITEM":
      // Mirrors the qualification pairing exactly, and for the same reason:
      // reaching a compliance item means a change disturbed what it depends
      // on — it does **not** mean the item became non-compliant. A person
      // decides that; the engine hands them the record.
      return ["CERTIFICATION_ITEM_PRESENT", "CERTIFICATION_ITEM_DISPOSITION_NOT_EVALUATED"];
    default:
      return [];
  }
}

/** Deduplicated and sorted, so identical findings carry identical basis lists. */
export function normalizeBasis(markers: readonly ImpactBasisMarker[]): ImpactBasisMarker[] {
  return [...new Set(markers)].sort();
}

// --- Limits -----------------------------------------------------------------

/**
 * Analysis ceilings.
 *
 * Same philosophy as the graph engine: a caller may ask for less but never
 * more, and a request above a cap is **rejected rather than clamped** — being
 * told you got a complete answer when the server quietly shrank the question is
 * worse than being refused. The node and edge budgets apply to the union across
 * all roots, so a change with many declared impacts cannot multiply its way
 * past them.
 */
export const IMPACT_LIMITS = {
  defaultMaxDepth: 3,
  maxMaxDepth: 5,
  defaultMaxNodes: 200,
  maxMaxNodes: 500,
  defaultMaxEdges: 1000,
  maxMaxEdges: 2000,
  /** Longest stored provenance path. Equal to the depth cap by construction. */
  maxPathLength: 5,
} as const;

export const runImpactAnalysisRequestSchema = z.strictObject({
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(IMPACT_LIMITS.maxMaxDepth)
    .default(IMPACT_LIMITS.defaultMaxDepth),
  maxNodes: z
    .number()
    .int()
    .min(1)
    .max(IMPACT_LIMITS.maxMaxNodes)
    .default(IMPACT_LIMITS.defaultMaxNodes),
  maxEdges: z
    .number()
    .int()
    .min(1)
    .max(IMPACT_LIMITS.maxMaxEdges)
    .default(IMPACT_LIMITS.defaultMaxEdges),
});

export type RunImpactAnalysisRequest = z.infer<typeof runImpactAnalysisRequestSchema>;

export const impactAnalysisIdSchema = entityIdSchema;

// --- Records ----------------------------------------------------------------

/** One object the analysis started from — a declared impact's target. */
export interface ImpactAnalysisRoot {
  id: string;
  analysisId: string;
  node: z.infer<typeof graphNodeRefSchema>;
  identifier: string | null;
  label: string;
  /** False when the declared target could not be resolved inside the project. */
  resolved: boolean;
  declaredImpactId: string | null;
}

/** One computed result: an object the engine says is reachable, and why. */
export interface ImpactFinding {
  id: string;
  analysisId: string;
  rootId: string;
  node: z.infer<typeof graphNodeRefSchema>;
  identifier: string | null;
  label: string;
  classification: ImpactClassification;
  status: ImpactFindingStatus;
  depth: number;
  basis: ImpactBasisMarker[];
  /** The canonical shortest path from the root, step by step. */
  path: TraversalStep[];
  /** Additional distinct paths that also reached this object. */
  alternatePathCount: number;
  createdAt: Date;
}

/** Counts, every one of them derived from the persisted findings. */
export interface ImpactSummary {
  declaredImpacts: number;
  roots: number;
  findings: number;
  direct: number;
  downstream: number;
  crossDomain: number;
  upstreamContext: number;
  unknown: number;
  notEvaluated: number;
}

export interface ImpactAnalysisLimits {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  truncated: boolean;
  truncatedBy: string | null;
}

export interface ImpactAnalysis {
  id: string;
  projectId: string;
  changeRequestId: string;
  status: ImpactAnalysisStatus;
  engineVersion: string;
  sourceFingerprint: string;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  requestedById: string | null;
  summary: ImpactSummary;
  limits: ImpactAnalysisLimits;
}

/** The full result, as the detail view and the API return it. */
export interface ImpactAnalysisReport {
  analysis: ImpactAnalysis;
  /** Derived at read time by comparing fingerprints — never stored. */
  freshness: ImpactFreshness;
  roots: ImpactAnalysisRoot[];
  findings: ImpactFinding[];
}

/**
 * What the API returns when no analysis has ever been run.
 *
 * A distinct shape rather than an empty report: zero counts would read as "we
 * looked and found nothing", which is a different and much stronger claim.
 */
export interface NoImpactAnalysis {
  status: "NOT_RUN";
  changeRequestId: string;
  engineVersion: string;
}

export type LatestImpactAnalysis = ImpactAnalysisReport | NoImpactAnalysis;

export function hasImpactAnalysis(
  value: LatestImpactAnalysis,
): value is ImpactAnalysisReport {
  return "analysis" in value;
}

// --- Deterministic ordering -------------------------------------------------

/**
 * Total order over findings.
 *
 * Classification first so the strongest results lead, then depth, then node
 * type and id. Nothing falls back to insertion order or database row order, so
 * two runs over the same graph list their findings identically.
 */
export function compareFindings(a: ImpactFinding, b: ImpactFinding): number {
  const byClass =
    CLASSIFICATION_PRECEDENCE[b.classification] - CLASSIFICATION_PRECEDENCE[a.classification];
  if (byClass !== 0) return byClass;
  if (a.depth !== b.depth) return a.depth - b.depth;
  if (a.node.type !== b.node.type) return a.node.type < b.node.type ? -1 : 1;
  if (a.node.id === b.node.id) return 0;
  return a.node.id < b.node.id ? -1 : 1;
}

/** Total order over roots: node type then id, independent of declaration order. */
export function compareRoots(
  a: { node: { type: string; id: string } },
  b: { node: { type: string; id: string } },
): number {
  if (a.node.type !== b.node.type) return a.node.type < b.node.type ? -1 : 1;
  if (a.node.id === b.node.id) return 0;
  return a.node.id < b.node.id ? -1 : 1;
}

/**
 * A stable signature of what an analysis concluded.
 *
 * Two runs are equivalent when their signatures match: same engine, same roots,
 * same objects, same classifications, same provenance. Ids and timestamps are
 * excluded on purpose — they differ between runs and say nothing about whether
 * the engine reached the same conclusion.
 */
export function analysisSignature(report: ImpactAnalysisReport): string {
  const roots = [...report.roots]
    .sort(compareRoots)
    .map((root) => `${root.node.type}:${root.node.id}:${root.resolved ? "R" : "U"}`);

  const findings = [...report.findings].sort(compareFindings).map((finding) => {
    const path = finding.path
      .map((step) => `${step.edgeType}/${step.traversed}/${step.relationshipId}`)
      .join(">");
    return [
      finding.node.type,
      finding.node.id,
      finding.classification,
      finding.status,
      String(finding.depth),
      finding.basis.join("+"),
      path,
    ].join("|");
  });

  return [
    `engine=${report.analysis.engineVersion}`,
    `roots=${roots.join(",")}`,
    `findings=${findings.join(";")}`,
  ].join("\n");
}

// --- Consumption by other engines -------------------------------------------

/**
 * How usable a stored analysis is to an engine that *reads* it.
 *
 * Wider than {@link ImpactFreshness} by one value: a consumer has to be able to
 * tell "nobody ran one" apart from "one was run and is now out of date", because
 * those call for different findings. A run that failed or never finished
 * produced nothing readable, so it reports as `NOT_RUN` rather than as a result.
 */
export const CONSUMED_ANALYSIS_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN", "NOT_RUN"] as const;
export type ConsumedAnalysisFreshness = (typeof CONSUMED_ANALYSIS_FRESHNESS)[number];

/**
 * **The single place a consumed analysis's freshness is decided.**
 *
 * Shared by every engine that reads impact analyses rather than running them,
 * so none of them can drift into treating a stale result as current — which is
 * the one mistake that would turn an out-of-date assessment into false
 * assurance.
 */
export function consumedAnalysisFreshness(
  analysis: { status: string; sourceFingerprint: string } | null,
  currentProjectFingerprint: string | null,
): ConsumedAnalysisFreshness {
  if (!analysis || analysis.status !== "COMPLETED") return "NOT_RUN";
  if (!analysis.sourceFingerprint || !currentProjectFingerprint) return "UNKNOWN";
  return analysis.sourceFingerprint === currentProjectFingerprint ? "CURRENT" : "STALE";
}

/** Guard used by the graph registry tests to keep the two tables in step. */
export function propagationRuleFor(edgeType: GraphEdgeType): ImpactPropagationRule {
  return IMPACT_PROPAGATION[edgeType];
}

/** The graph edge definition a propagation rule is written against. */
export function edgeDefinitionFor(edgeType: GraphEdgeType) {
  return GRAPH_EDGE_DEFINITIONS[edgeType];
}
