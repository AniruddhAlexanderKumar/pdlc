import type { GraphEdgeType, GraphNodeRef, GraphNodeType } from "@/domain";
import type { DbClient } from "@/lib/db";

/**
 * One explicit resolver per canonical edge type.
 *
 * These are deliberately hand-written rather than generated from a table
 * config: each one knows the real columns, the real relation names, and the
 * real direction of the relationship it reads. There is no dynamic table
 * dispatch and no SQL construction anywhere.
 *
 * **Batched by design.** Each resolver takes a *set* of node references — a
 * whole breadth-first frontier — and issues at most one query. Resolving edges
 * one node at a time would mean tens of queries per visited node, which is
 * exactly the load the traversal caps exist to prevent. A resolver whose
 * endpoint type is absent from the frontier issues no query at all, so the edge
 * registry does real work in cutting the query count down.
 *
 * **Project boundary.** Every query constrains *both* endpoints to the project.
 * An edge whose other end lives in a different project is therefore never
 * returned — the graph fails closed rather than quietly crossing a project
 * boundary. `audit` deliberately drops the target-side constraint so the
 * consistency check can *find* those rows and report them.
 *
 * **Determinism.** Every query orders by `createdAt` then `id`, so results
 * never depend on database row order.
 */

/** An edge as read from its relationship row, before node details are resolved. */
export interface RawEdge {
  type: GraphEdgeType;
  relationshipId: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  linkType: string | null;
  source: GraphNodeRef;
  target: GraphNodeRef;
}

/** A relationship row seen by the consistency check, with both projects visible. */
export interface AuditEdge {
  type: GraphEdgeType;
  relationshipId: string;
  source: GraphNodeRef;
  /** Null when the row has no target set at all — a malformed relationship. */
  target: GraphNodeRef | null;
  /** Null when the endpoint row is absent — impossible under intact FKs. */
  targetProjectId: string | null;
  /**
   * The relationship's sub-kind, where it has one. Part of what makes a pair
   * unique in the five tables whose unique key includes it.
   */
  linkType: string | null;
}

export interface EdgeResolver {
  type: GraphEdgeType;
  /** Edges where one of the given nodes is the source. */
  outgoing(projectId: string, refs: readonly GraphNodeRef[], client: DbClient): Promise<RawEdge[]>;
  /** Edges where one of the given nodes is the target. */
  incoming(projectId: string, refs: readonly GraphNodeRef[], client: DbClient): Promise<RawEdge[]>;
  /** All edges whose source is in the project, target project left unfiltered. */
  audit(projectId: string, client: DbClient): Promise<AuditEdge[]>;
}

const ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

function ref(type: GraphNodeType, id: string): GraphNodeRef {
  return { type, id };
}

/** The distinct ids in `refs` that are of the given node type. */
function idsOfType(refs: readonly GraphNodeRef[], type: GraphNodeType): string[] {
  const ids = new Set<string>();
  for (const candidate of refs) {
    if (candidate.type === type) ids.add(candidate.id);
  }
  return [...ids];
}

// --- Stakeholder need → requirement -----------------------------------------

const NEED_REQUIREMENT_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  stakeholderNeedId: true,
  requirementId: true,
} as const;

function toNeedRequirementEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  stakeholderNeedId: string;
  requirementId: string;
}): RawEdge {
  return {
    type: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: null,
    linkType: null,
    source: ref("STAKEHOLDER_NEED", row.stakeholderNeedId),
    target: ref("REQUIREMENT", row.requirementId),
  };
}

const needDerivesRequirement: EdgeResolver = {
  type: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "STAKEHOLDER_NEED");
    if (ids.length === 0) return [];

    const rows = await client.needRequirementLink.findMany({
      where: {
        stakeholderNeedId: { in: ids },
        stakeholderNeed: { projectId },
        requirement: { projectId },
      },
      select: NEED_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toNeedRequirementEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.needRequirementLink.findMany({
      where: {
        requirementId: { in: ids },
        stakeholderNeed: { projectId },
        requirement: { projectId },
      },
      select: NEED_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toNeedRequirementEdge);
  },
  async audit(projectId, client) {
    const rows = await client.needRequirementLink.findMany({
      where: { stakeholderNeed: { projectId } },
      select: {
        id: true,
        stakeholderNeedId: true,
        requirementId: true,
        requirement: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT" as const,
      relationshipId: row.id,
      source: ref("STAKEHOLDER_NEED", row.stakeholderNeedId),
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Requirement → requirement ----------------------------------------------

const REQUIREMENT_LINK_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  linkType: true,
  sourceRequirementId: true,
  targetRequirementId: true,
} as const;

function toRequirementLinkEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  linkType: string;
  sourceRequirementId: string;
  targetRequirementId: string;
}): RawEdge {
  return {
    type: "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: row.linkType,
    source: ref("REQUIREMENT", row.sourceRequirementId),
    target: ref("REQUIREMENT", row.targetRequirementId),
  };
}

const requirementDependsOnRequirement: EdgeResolver = {
  type: "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.requirementLink.findMany({
      where: {
        sourceRequirementId: { in: ids },
        sourceRequirement: { projectId },
        targetRequirement: { projectId },
      },
      select: REQUIREMENT_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementLinkEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.requirementLink.findMany({
      where: {
        targetRequirementId: { in: ids },
        sourceRequirement: { projectId },
        targetRequirement: { projectId },
      },
      select: REQUIREMENT_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementLinkEdge);
  },
  async audit(projectId, client) {
    const rows = await client.requirementLink.findMany({
      where: { sourceRequirement: { projectId } },
      select: {
        linkType: true,
        id: true,
        sourceRequirementId: true,
        targetRequirementId: true,
        targetRequirement: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "REQUIREMENT_DEPENDS_ON_REQUIREMENT" as const,
      relationshipId: row.id,
      source: ref("REQUIREMENT", row.sourceRequirementId),
      target: ref("REQUIREMENT", row.targetRequirementId),
      targetProjectId: row.targetRequirement?.projectId ?? null,
      linkType: row.linkType,
    }));
  },
};

// --- Requirement → design item ----------------------------------------------

const REQUIREMENT_DESIGN_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  linkType: true,
  requirementId: true,
  designItemId: true,
} as const;

function toRequirementDesignEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  linkType: string;
  requirementId: string;
  designItemId: string;
}): RawEdge {
  return {
    type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: row.linkType,
    source: ref("REQUIREMENT", row.requirementId),
    target: ref("DESIGN_ITEM", row.designItemId),
  };
}

const requirementAllocatedToDesign: EdgeResolver = {
  type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.requirementDesignLink.findMany({
      where: { requirementId: { in: ids }, requirement: { projectId }, designItem: { projectId } },
      select: REQUIREMENT_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementDesignEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.requirementDesignLink.findMany({
      where: { designItemId: { in: ids }, requirement: { projectId }, designItem: { projectId } },
      select: REQUIREMENT_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementDesignEdge);
  },
  async audit(projectId, client) {
    const rows = await client.requirementDesignLink.findMany({
      where: { requirement: { projectId } },
      select: {
        linkType: true,
        id: true,
        requirementId: true,
        designItemId: true,
        designItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "REQUIREMENT_ALLOCATED_TO_DESIGN" as const,
      relationshipId: row.id,
      source: ref("REQUIREMENT", row.requirementId),
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
      linkType: row.linkType,
    }));
  },
};

// --- Requirement → verification activity ------------------------------------

const REQUIREMENT_VERIFICATION_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  requirementId: true,
  verificationActivityId: true,
} as const;

function toRequirementVerificationEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  requirementId: string;
  verificationActivityId: string;
}): RawEdge {
  return {
    type: "REQUIREMENT_VERIFIED_BY",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("REQUIREMENT", row.requirementId),
    target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
  };
}

const requirementVerifiedBy: EdgeResolver = {
  type: "REQUIREMENT_VERIFIED_BY",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.requirementVerificationLink.findMany({
      where: {
        requirementId: { in: ids },
        requirement: { projectId },
        verificationActivity: { projectId },
      },
      select: REQUIREMENT_VERIFICATION_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementVerificationEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "VERIFICATION_ACTIVITY");
    if (ids.length === 0) return [];

    const rows = await client.requirementVerificationLink.findMany({
      where: {
        verificationActivityId: { in: ids },
        requirement: { projectId },
        verificationActivity: { projectId },
      },
      select: REQUIREMENT_VERIFICATION_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementVerificationEdge);
  },
  async audit(projectId, client) {
    const rows = await client.requirementVerificationLink.findMany({
      where: { requirement: { projectId } },
      select: {
        id: true,
        requirementId: true,
        verificationActivityId: true,
        verificationActivity: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "REQUIREMENT_VERIFIED_BY" as const,
      relationshipId: row.id,
      source: ref("REQUIREMENT", row.requirementId),
      target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
      targetProjectId: row.verificationActivity?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Requirement ↔ decision --------------------------------------------------

const REQUIREMENT_DECISION_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  linkType: true,
  requirementId: true,
  engineeringDecisionId: true,
} as const;

function toRequirementDecisionEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  linkType: string;
  requirementId: string;
  engineeringDecisionId: string;
}): RawEdge {
  return {
    type: "REQUIREMENT_LINKED_TO_DECISION",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: row.linkType,
    source: ref("REQUIREMENT", row.requirementId),
    target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
  };
}

const requirementLinkedToDecision: EdgeResolver = {
  type: "REQUIREMENT_LINKED_TO_DECISION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.requirementDecisionLink.findMany({
      where: {
        requirementId: { in: ids },
        requirement: { projectId },
        engineeringDecision: { projectId },
      },
      select: REQUIREMENT_DECISION_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementDecisionEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.requirementDecisionLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        requirement: { projectId },
        engineeringDecision: { projectId },
      },
      select: REQUIREMENT_DECISION_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRequirementDecisionEdge);
  },
  async audit(projectId, client) {
    const rows = await client.requirementDecisionLink.findMany({
      where: { requirement: { projectId } },
      select: {
        linkType: true,
        id: true,
        requirementId: true,
        engineeringDecisionId: true,
        engineeringDecision: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "REQUIREMENT_LINKED_TO_DECISION" as const,
      relationshipId: row.id,
      source: ref("REQUIREMENT", row.requirementId),
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      targetProjectId: row.engineeringDecision?.projectId ?? null,
      linkType: row.linkType,
    }));
  },
};

// --- Decision → design -------------------------------------------------------

const DECISION_DESIGN_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  engineeringDecisionId: true,
  designItemId: true,
} as const;

function toDecisionDesignEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  engineeringDecisionId: string;
  designItemId: string;
}): RawEdge {
  return {
    type: "DECISION_AFFECTS_DESIGN",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    target: ref("DESIGN_ITEM", row.designItemId),
  };
}

const decisionAffectsDesign: EdgeResolver = {
  type: "DECISION_AFFECTS_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionDesignLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        engineeringDecision: { projectId },
        designItem: { projectId },
      },
      select: DECISION_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionDesignEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.decisionDesignLink.findMany({
      where: {
        designItemId: { in: ids },
        engineeringDecision: { projectId },
        designItem: { projectId },
      },
      select: DECISION_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionDesignEdge);
  },
  async audit(projectId, client) {
    const rows = await client.decisionDesignLink.findMany({
      where: { engineeringDecision: { projectId } },
      select: {
        id: true,
        engineeringDecisionId: true,
        designItemId: true,
        designItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_AFFECTS_DESIGN" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Decision → risk ---------------------------------------------------------

const DECISION_RISK_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  engineeringDecisionId: true,
  riskId: true,
} as const;

function toDecisionRiskEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  engineeringDecisionId: string;
  riskId: string;
}): RawEdge {
  return {
    type: "DECISION_AFFECTS_RISK",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    target: ref("RISK", row.riskId),
  };
}

const decisionAffectsRisk: EdgeResolver = {
  type: "DECISION_AFFECTS_RISK",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionRiskLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        engineeringDecision: { projectId },
        risk: { projectId },
      },
      select: DECISION_RISK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionRiskEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "RISK");
    if (ids.length === 0) return [];

    const rows = await client.decisionRiskLink.findMany({
      where: { riskId: { in: ids }, engineeringDecision: { projectId }, risk: { projectId } },
      select: DECISION_RISK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionRiskEdge);
  },
  async audit(projectId, client) {
    const rows = await client.decisionRiskLink.findMany({
      where: { engineeringDecision: { projectId } },
      select: {
        id: true,
        engineeringDecisionId: true,
        riskId: true,
        risk: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_AFFECTS_RISK" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("RISK", row.riskId),
      targetProjectId: row.risk?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Decision → issue --------------------------------------------------------

const DECISION_ISSUE_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  engineeringDecisionId: true,
  issueId: true,
} as const;

function toDecisionIssueEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  engineeringDecisionId: string;
  issueId: string;
}): RawEdge {
  return {
    type: "DECISION_AFFECTS_ISSUE",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    target: ref("ISSUE", row.issueId),
  };
}

const decisionAffectsIssue: EdgeResolver = {
  type: "DECISION_AFFECTS_ISSUE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionIssueLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        engineeringDecision: { projectId },
        issue: { projectId },
      },
      select: DECISION_ISSUE_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionIssueEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "ISSUE");
    if (ids.length === 0) return [];

    const rows = await client.decisionIssueLink.findMany({
      where: { issueId: { in: ids }, engineeringDecision: { projectId }, issue: { projectId } },
      select: DECISION_ISSUE_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDecisionIssueEdge);
  },
  async audit(projectId, client) {
    const rows = await client.decisionIssueLink.findMany({
      where: { engineeringDecision: { projectId } },
      select: {
        id: true,
        engineeringDecisionId: true,
        issueId: true,
        issue: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_AFFECTS_ISSUE" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("ISSUE", row.issueId),
      targetProjectId: row.issue?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Design item → design item -----------------------------------------------

const DESIGN_ITEM_LINK_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  linkType: true,
  sourceDesignItemId: true,
  targetDesignItemId: true,
} as const;

function toDesignItemLinkEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  linkType: string;
  sourceDesignItemId: string;
  targetDesignItemId: string;
}): RawEdge {
  return {
    type: "DESIGN_CHILD_OF_DESIGN",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: null,
    linkType: row.linkType,
    source: ref("DESIGN_ITEM", row.sourceDesignItemId),
    target: ref("DESIGN_ITEM", row.targetDesignItemId),
  };
}

const designChildOfDesign: EdgeResolver = {
  type: "DESIGN_CHILD_OF_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.designItemLink.findMany({
      where: {
        sourceDesignItemId: { in: ids },
        sourceDesignItem: { projectId },
        targetDesignItem: { projectId },
      },
      select: DESIGN_ITEM_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDesignItemLinkEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.designItemLink.findMany({
      where: {
        targetDesignItemId: { in: ids },
        sourceDesignItem: { projectId },
        targetDesignItem: { projectId },
      },
      select: DESIGN_ITEM_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDesignItemLinkEdge);
  },
  async audit(projectId, client) {
    const rows = await client.designItemLink.findMany({
      where: { sourceDesignItem: { projectId } },
      select: {
        linkType: true,
        id: true,
        sourceDesignItemId: true,
        targetDesignItemId: true,
        targetDesignItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DESIGN_CHILD_OF_DESIGN" as const,
      relationshipId: row.id,
      source: ref("DESIGN_ITEM", row.sourceDesignItemId),
      target: ref("DESIGN_ITEM", row.targetDesignItemId),
      targetProjectId: row.targetDesignItem?.projectId ?? null,
      linkType: row.linkType,
    }));
  },
};

// --- Design item → interface --------------------------------------------------

const DESIGN_INTERFACE_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  linkType: true,
  designItemId: true,
  interfaceDefinitionId: true,
} as const;

function toDesignInterfaceEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  linkType: string;
  designItemId: string;
  interfaceDefinitionId: string;
}): RawEdge {
  return {
    type: "DESIGN_CONNECTS_INTERFACE",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: null,
    linkType: row.linkType,
    source: ref("DESIGN_ITEM", row.designItemId),
    target: ref("INTERFACE_DEFINITION", row.interfaceDefinitionId),
  };
}

const designConnectsInterface: EdgeResolver = {
  type: "DESIGN_CONNECTS_INTERFACE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.designInterfaceLink.findMany({
      where: {
        designItemId: { in: ids },
        designItem: { projectId },
        interfaceDefinition: { projectId },
      },
      select: DESIGN_INTERFACE_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDesignInterfaceEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "INTERFACE_DEFINITION");
    if (ids.length === 0) return [];

    const rows = await client.designInterfaceLink.findMany({
      where: {
        interfaceDefinitionId: { in: ids },
        designItem: { projectId },
        interfaceDefinition: { projectId },
      },
      select: DESIGN_INTERFACE_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toDesignInterfaceEdge);
  },
  async audit(projectId, client) {
    const rows = await client.designInterfaceLink.findMany({
      where: { designItem: { projectId } },
      select: {
        linkType: true,
        id: true,
        designItemId: true,
        interfaceDefinitionId: true,
        interfaceDefinition: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DESIGN_CONNECTS_INTERFACE" as const,
      relationshipId: row.id,
      source: ref("DESIGN_ITEM", row.designItemId),
      target: ref("INTERFACE_DEFINITION", row.interfaceDefinitionId),
      targetProjectId: row.interfaceDefinition?.projectId ?? null,
      linkType: row.linkType,
    }));
  },
};

// --- Risk → requirement ------------------------------------------------------

const RISK_REQUIREMENT_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  riskId: true,
  requirementId: true,
} as const;

function toRiskRequirementEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  riskId: string;
  requirementId: string;
}): RawEdge {
  return {
    type: "RISK_AFFECTS_REQUIREMENT",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("RISK", row.riskId),
    target: ref("REQUIREMENT", row.requirementId),
  };
}

const riskAffectsRequirement: EdgeResolver = {
  type: "RISK_AFFECTS_REQUIREMENT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "RISK");
    if (ids.length === 0) return [];

    const rows = await client.riskRequirementLink.findMany({
      where: { riskId: { in: ids }, risk: { projectId }, requirement: { projectId } },
      select: RISK_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRiskRequirementEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.riskRequirementLink.findMany({
      where: { requirementId: { in: ids }, risk: { projectId }, requirement: { projectId } },
      select: RISK_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRiskRequirementEdge);
  },
  async audit(projectId, client) {
    const rows = await client.riskRequirementLink.findMany({
      where: { risk: { projectId } },
      select: {
        id: true,
        riskId: true,
        requirementId: true,
        requirement: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "RISK_AFFECTS_REQUIREMENT" as const,
      relationshipId: row.id,
      source: ref("RISK", row.riskId),
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Risk → design item ------------------------------------------------------

const RISK_DESIGN_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  riskId: true,
  designItemId: true,
} as const;

function toRiskDesignEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  riskId: string;
  designItemId: string;
}): RawEdge {
  return {
    type: "RISK_AFFECTS_DESIGN",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("RISK", row.riskId),
    target: ref("DESIGN_ITEM", row.designItemId),
  };
}

const riskAffectsDesign: EdgeResolver = {
  type: "RISK_AFFECTS_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "RISK");
    if (ids.length === 0) return [];

    const rows = await client.riskDesignLink.findMany({
      where: { riskId: { in: ids }, risk: { projectId }, designItem: { projectId } },
      select: RISK_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRiskDesignEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.riskDesignLink.findMany({
      where: { designItemId: { in: ids }, risk: { projectId }, designItem: { projectId } },
      select: RISK_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toRiskDesignEdge);
  },
  async audit(projectId, client) {
    const rows = await client.riskDesignLink.findMany({
      where: { risk: { projectId } },
      select: {
        id: true,
        riskId: true,
        designItemId: true,
        designItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "RISK_AFFECTS_DESIGN" as const,
      relationshipId: row.id,
      source: ref("RISK", row.riskId),
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Issue → requirement -----------------------------------------------------

const ISSUE_REQUIREMENT_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  issueId: true,
  requirementId: true,
} as const;

function toIssueRequirementEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  issueId: string;
  requirementId: string;
}): RawEdge {
  return {
    type: "ISSUE_AFFECTS_REQUIREMENT",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("ISSUE", row.issueId),
    target: ref("REQUIREMENT", row.requirementId),
  };
}

const issueAffectsRequirement: EdgeResolver = {
  type: "ISSUE_AFFECTS_REQUIREMENT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ISSUE");
    if (ids.length === 0) return [];

    const rows = await client.issueRequirementLink.findMany({
      where: { issueId: { in: ids }, issue: { projectId }, requirement: { projectId } },
      select: ISSUE_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toIssueRequirementEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.issueRequirementLink.findMany({
      where: { requirementId: { in: ids }, issue: { projectId }, requirement: { projectId } },
      select: ISSUE_REQUIREMENT_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toIssueRequirementEdge);
  },
  async audit(projectId, client) {
    const rows = await client.issueRequirementLink.findMany({
      where: { issue: { projectId } },
      select: {
        id: true,
        issueId: true,
        requirementId: true,
        requirement: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "ISSUE_AFFECTS_REQUIREMENT" as const,
      relationshipId: row.id,
      source: ref("ISSUE", row.issueId),
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Issue → design item -----------------------------------------------------

const ISSUE_DESIGN_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  issueId: true,
  designItemId: true,
} as const;

function toIssueDesignEdge(row: {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  issueId: string;
  designItemId: string;
}): RawEdge {
  return {
    type: "ISSUE_AFFECTS_DESIGN",
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: row.createdById,
    note: row.note,
    linkType: null,
    source: ref("ISSUE", row.issueId),
    target: ref("DESIGN_ITEM", row.designItemId),
  };
}

const issueAffectsDesign: EdgeResolver = {
  type: "ISSUE_AFFECTS_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ISSUE");
    if (ids.length === 0) return [];

    const rows = await client.issueDesignLink.findMany({
      where: { issueId: { in: ids }, issue: { projectId }, designItem: { projectId } },
      select: ISSUE_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toIssueDesignEdge);
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.issueDesignLink.findMany({
      where: { designItemId: { in: ids }, issue: { projectId }, designItem: { projectId } },
      select: ISSUE_DESIGN_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toIssueDesignEdge);
  },
  async audit(projectId, client) {
    const rows = await client.issueDesignLink.findMany({
      where: { issue: { projectId } },
      select: {
        id: true,
        issueId: true,
        designItemId: true,
        designItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "ISSUE_AFFECTS_DESIGN" as const,
      relationshipId: row.id,
      source: ref("ISSUE", row.issueId),
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Evidence links ----------------------------------------------------------
//
// One table serves three edge types, distinguished by which subject column is
// set. A CHECK constraint guarantees exactly one of them is, so each variant
// filters on its own column being non-null and never sees the others' rows.

const EVIDENCE_LINK_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  evidenceId: true,
  requirementId: true,
  engineeringDecisionId: true,
  verificationActivityId: true,
  complianceItemId: true,
} as const;

interface EvidenceLinkRow {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  evidenceId: string;
  requirementId: string | null;
  engineeringDecisionId: string | null;
  verificationActivityId: string | null;
  complianceItemId?: string | null;
}

type EvidenceEdgeType =
  | "REQUIREMENT_HAS_EVIDENCE"
  | "DECISION_HAS_EVIDENCE"
  | "VERIFICATION_HAS_EVIDENCE"
  | "SUPPLIED_ITEM_HAS_EVIDENCE"
  | "SUPPLIER_QUALIFICATION_HAS_EVIDENCE"
  | "COMPLIANCE_ITEM_LINKED_TO_OBJECT";

function toEvidenceEdge(
  type: EvidenceEdgeType,
  subjectType: GraphNodeType,
  subjectId: string | null,
  row: EvidenceLinkRow,
): RawEdge[] {
  // The subject column is guaranteed non-null by both the query filter and a
  // CHECK constraint; this keeps the types honest without inventing an id.
  if (!subjectId) return [];

  return [
    {
      type,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref(subjectType, subjectId),
      target: ref("EVIDENCE", row.evidenceId),
    },
  ];
}

const requirementHasEvidence: EdgeResolver = {
  type: "REQUIREMENT_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: { requirementId: { in: ids }, requirement: { projectId }, evidence: { projectId } },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge("REQUIREMENT_HAS_EVIDENCE", "REQUIREMENT", row.requirementId, row),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        evidenceId: { in: ids },
        requirementId: { not: null },
        requirement: { projectId },
        evidence: { projectId },
      },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge("REQUIREMENT_HAS_EVIDENCE", "REQUIREMENT", row.requirementId, row),
    );
  },
  async audit(projectId, client) {
    const rows = await client.evidenceLink.findMany({
      where: { requirementId: { not: null }, requirement: { projectId } },
      select: {
        id: true,
        evidenceId: true,
        requirementId: true,
        evidence: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.requirementId
        ? [
            {
              type: "REQUIREMENT_HAS_EVIDENCE" as const,
              relationshipId: row.id,
              source: ref("REQUIREMENT", row.requirementId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

const decisionHasEvidence: EdgeResolver = {
  type: "DECISION_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        engineeringDecision: { projectId },
        evidence: { projectId },
      },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "DECISION_HAS_EVIDENCE",
        "ENGINEERING_DECISION",
        row.engineeringDecisionId,
        row,
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        evidenceId: { in: ids },
        engineeringDecisionId: { not: null },
        engineeringDecision: { projectId },
        evidence: { projectId },
      },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "DECISION_HAS_EVIDENCE",
        "ENGINEERING_DECISION",
        row.engineeringDecisionId,
        row,
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.evidenceLink.findMany({
      where: { engineeringDecisionId: { not: null }, engineeringDecision: { projectId } },
      select: {
        id: true,
        evidenceId: true,
        engineeringDecisionId: true,
        evidence: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.engineeringDecisionId
        ? [
            {
              type: "DECISION_HAS_EVIDENCE" as const,
              relationshipId: row.id,
              source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

const verificationHasEvidence: EdgeResolver = {
  type: "VERIFICATION_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "VERIFICATION_ACTIVITY");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        verificationActivityId: { in: ids },
        verificationActivity: { projectId },
        evidence: { projectId },
      },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "VERIFICATION_HAS_EVIDENCE",
        "VERIFICATION_ACTIVITY",
        row.verificationActivityId,
        row,
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        evidenceId: { in: ids },
        verificationActivityId: { not: null },
        verificationActivity: { projectId },
        evidence: { projectId },
      },
      select: EVIDENCE_LINK_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "VERIFICATION_HAS_EVIDENCE",
        "VERIFICATION_ACTIVITY",
        row.verificationActivityId,
        row,
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.evidenceLink.findMany({
      where: { verificationActivityId: { not: null }, verificationActivity: { projectId } },
      select: {
        id: true,
        evidenceId: true,
        verificationActivityId: true,
        evidence: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.verificationActivityId
        ? [
            {
              type: "VERIFICATION_HAS_EVIDENCE" as const,
              relationshipId: row.id,
              source: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

// --- Decision memory children -------------------------------------------------
//
// These are parent/child foreign keys rather than join tables, so the child row
// *is* the relationship: its own id is both the edge's provenance and the target
// node's id, and there is no separate createdBy or note to report.
//
// The child carries no projectId of its own, so the project is enforced through
// the parent decision — which is also why such a child can never be
// cross-project.

type DecisionChildEdgeType =
  | "DECISION_HAS_ALTERNATIVE"
  | "DECISION_HAS_ASSUMPTION"
  | "DECISION_HAS_EXPECTATION";

function childEdge(
  type: DecisionChildEdgeType,
  childType: GraphNodeType,
  row: { id: string; createdAt: Date; engineeringDecisionId: string },
): RawEdge {
  return {
    type,
    relationshipId: row.id,
    createdAt: row.createdAt,
    createdById: null,
    note: null,
    linkType: null,
    source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    target: ref(childType, row.id),
  };
}

const DECISION_CHILD_SELECT = {
  id: true,
  createdAt: true,
  engineeringDecisionId: true,
} as const;

const decisionHasAlternative: EdgeResolver = {
  type: "DECISION_HAS_ALTERNATIVE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionAlternative.findMany({
      where: { engineeringDecisionId: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_ALTERNATIVE", "DECISION_ALTERNATIVE", row));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DECISION_ALTERNATIVE");
    if (ids.length === 0) return [];

    const rows = await client.decisionAlternative.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_ALTERNATIVE", "DECISION_ALTERNATIVE", row));
  },
  async audit(projectId, client) {
    const rows = await client.decisionAlternative.findMany({
      where: { engineeringDecision: { projectId } },
      select: { id: true, engineeringDecisionId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_HAS_ALTERNATIVE" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("DECISION_ALTERNATIVE", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const decisionHasAssumption: EdgeResolver = {
  type: "DECISION_HAS_ASSUMPTION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionAssumption.findMany({
      where: { engineeringDecisionId: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_ASSUMPTION", "DECISION_ASSUMPTION", row));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DECISION_ASSUMPTION");
    if (ids.length === 0) return [];

    const rows = await client.decisionAssumption.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_ASSUMPTION", "DECISION_ASSUMPTION", row));
  },
  async audit(projectId, client) {
    const rows = await client.decisionAssumption.findMany({
      where: { engineeringDecision: { projectId } },
      select: { id: true, engineeringDecisionId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_HAS_ASSUMPTION" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("DECISION_ASSUMPTION", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const decisionHasExpectation: EdgeResolver = {
  type: "DECISION_HAS_EXPECTATION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.decisionExpectation.findMany({
      where: { engineeringDecisionId: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_EXPECTATION", "DECISION_EXPECTATION", row));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DECISION_EXPECTATION");
    if (ids.length === 0) return [];

    const rows = await client.decisionExpectation.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: DECISION_CHILD_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => childEdge("DECISION_HAS_EXPECTATION", "DECISION_EXPECTATION", row));
  },
  async audit(projectId, client) {
    const rows = await client.decisionExpectation.findMany({
      where: { engineeringDecision: { projectId } },
      select: { id: true, engineeringDecisionId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DECISION_HAS_EXPECTATION" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      target: ref("DECISION_EXPECTATION", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

// --- Change impact (polymorphic target) ----------------------------------------

const CHANGE_IMPACT_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  changeRequestId: true,
  requirementId: true,
  designItemId: true,
  engineeringDecisionId: true,
  verificationActivityId: true,
  riskId: true,
  issueId: true,
  supplierId: true,
  suppliedItemId: true,
  requirement: { select: { projectId: true } },
  designItem: { select: { projectId: true } },
  engineeringDecision: { select: { projectId: true } },
  verificationActivity: { select: { projectId: true } },
  risk: { select: { projectId: true } },
  issue: { select: { projectId: true } },
  supplier: { select: { projectId: true } },
  suppliedItem: { select: { projectId: true } },
} as const;

interface ChangeImpactRow {
  id: string;
  createdAt: Date;
  createdById: string | null;
  note: string | null;
  changeRequestId: string;
  requirementId: string | null;
  designItemId: string | null;
  engineeringDecisionId: string | null;
  verificationActivityId: string | null;
  riskId: string | null;
  issueId: string | null;
  supplierId: string | null;
  suppliedItemId: string | null;
  requirement: { projectId: string } | null;
  designItem: { projectId: string } | null;
  engineeringDecision: { projectId: string } | null;
  verificationActivity: { projectId: string } | null;
  risk: { projectId: string } | null;
  issue: { projectId: string } | null;
  supplier: { projectId: string } | null;
  suppliedItem: { projectId: string } | null;
}

interface ResolvedTarget {
  target: GraphNodeRef;
  targetProjectId: string | null;
}

/**
 * Reads whichever single target column a change-impact row has set, along with
 * that target's own project so the caller can enforce the boundary.
 */
function changeImpactTarget(row: ChangeImpactRow): ResolvedTarget | null {
  if (row.requirementId) {
    return {
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
    };
  }
  if (row.designItemId) {
    return {
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
    };
  }
  if (row.engineeringDecisionId) {
    return {
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      targetProjectId: row.engineeringDecision?.projectId ?? null,
    };
  }
  if (row.verificationActivityId) {
    return {
      target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
      targetProjectId: row.verificationActivity?.projectId ?? null,
    };
  }
  if (row.riskId) {
    return { target: ref("RISK", row.riskId), targetProjectId: row.risk?.projectId ?? null };
  }
  if (row.issueId) {
    return { target: ref("ISSUE", row.issueId), targetProjectId: row.issue?.projectId ?? null };
  }
  if (row.supplierId) {
    return {
      target: ref("SUPPLIER", row.supplierId),
      targetProjectId: row.supplier?.projectId ?? null,
    };
  }
  if (row.suppliedItemId) {
    return {
      target: ref("SUPPLIED_ITEM", row.suppliedItemId),
      targetProjectId: row.suppliedItem?.projectId ?? null,
    };
  }
  // A CHECK constraint makes this unreachable; the consistency check reports it
  // as malformed in case that constraint is ever dropped.
  return null;
}

/** Fails closed: a row whose target is missing or in another project yields no edge. */
function toChangeImpactEdge(projectId: string, row: ChangeImpactRow): RawEdge[] {
  const resolved = changeImpactTarget(row);
  if (!resolved || resolved.targetProjectId !== projectId) return [];

  return [
    {
      type: "CHANGE_IMPACTS_OBJECT",
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("CHANGE_REQUEST", row.changeRequestId),
      target: resolved.target,
    },
  ];
}

const changeImpactsObject: EdgeResolver = {
  type: "CHANGE_IMPACTS_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CHANGE_REQUEST");
    if (ids.length === 0) return [];

    const rows = await client.changeRequestImpact.findMany({
      where: { changeRequestId: { in: ids }, changeRequest: { projectId } },
      select: CHANGE_IMPACT_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => toChangeImpactEdge(projectId, row));
  },
  async incoming(projectId, refs, client) {
    // Each target type lives in its own column, so the query ORs across only
    // the columns the frontier actually contains.
    const branches: Record<string, { in: string[] }>[] = [];
    const push = (column: string, type: GraphNodeType) => {
      const ids = idsOfType(refs, type);
      if (ids.length > 0) branches.push({ [column]: { in: ids } });
    };
    push("requirementId", "REQUIREMENT");
    push("designItemId", "DESIGN_ITEM");
    push("engineeringDecisionId", "ENGINEERING_DECISION");
    push("verificationActivityId", "VERIFICATION_ACTIVITY");
    push("riskId", "RISK");
    push("issueId", "ISSUE");
    push("supplierId", "SUPPLIER");
    push("suppliedItemId", "SUPPLIED_ITEM");
    if (branches.length === 0) return [];

    const rows = await client.changeRequestImpact.findMany({
      where: { changeRequest: { projectId }, OR: branches },
      select: CHANGE_IMPACT_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => toChangeImpactEdge(projectId, row));
  },
  async audit(projectId, client) {
    const rows = await client.changeRequestImpact.findMany({
      where: { changeRequest: { projectId } },
      select: CHANGE_IMPACT_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => {
      const resolved = changeImpactTarget(row);
      return {
        type: "CHANGE_IMPACTS_OBJECT" as const,
        relationshipId: row.id,
        source: ref("CHANGE_REQUEST", row.changeRequestId),
        target: resolved?.target ?? null,
        targetProjectId: resolved?.targetProjectId ?? null,
        linkType: null,
      };
    });
  },
};

// --- Approval (polymorphic target) ---------------------------------------------

const APPROVAL_SELECT = {
  id: true,
  createdAt: true,
  approverId: true,
  requirementId: true,
  engineeringDecisionId: true,
  changeRequestId: true,
  requirement: { select: { projectId: true } },
  engineeringDecision: { select: { projectId: true } },
  changeRequest: { select: { projectId: true } },
} as const;

interface ApprovalRow {
  id: string;
  createdAt: Date;
  approverId: string;
  requirementId: string | null;
  engineeringDecisionId: string | null;
  changeRequestId: string | null;
  requirement: { projectId: string } | null;
  engineeringDecision: { projectId: string } | null;
  changeRequest: { projectId: string } | null;
}

function approvalTarget(row: ApprovalRow): ResolvedTarget | null {
  if (row.requirementId) {
    return {
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
    };
  }
  if (row.engineeringDecisionId) {
    return {
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      targetProjectId: row.engineeringDecision?.projectId ?? null,
    };
  }
  if (row.changeRequestId) {
    return {
      target: ref("CHANGE_REQUEST", row.changeRequestId),
      targetProjectId: row.changeRequest?.projectId ?? null,
    };
  }
  return null;
}

/** Fails closed, exactly as change impacts do. */
function toApprovalEdge(projectId: string, row: ApprovalRow): RawEdge[] {
  const resolved = approvalTarget(row);
  if (!resolved || resolved.targetProjectId !== projectId) return [];

  return [
    {
      type: "APPROVAL_RELATES_TO_OBJECT",
      relationshipId: row.id,
      createdAt: row.createdAt,
      // The approver is the actor, and is the closest thing this row has to an
      // author.
      createdById: row.approverId,
      note: null,
      linkType: null,
      source: ref("APPROVAL", row.id),
      target: resolved.target,
    },
  ];
}

const approvalRelatesToObject: EdgeResolver = {
  type: "APPROVAL_RELATES_TO_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "APPROVAL");
    if (ids.length === 0) return [];

    const rows = await client.approval.findMany({
      where: { id: { in: ids }, projectId },
      select: APPROVAL_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => toApprovalEdge(projectId, row));
  },
  async incoming(projectId, refs, client) {
    const branches: Record<string, { in: string[] }>[] = [];
    const push = (column: string, type: GraphNodeType) => {
      const ids = idsOfType(refs, type);
      if (ids.length > 0) branches.push({ [column]: { in: ids } });
    };
    push("requirementId", "REQUIREMENT");
    push("engineeringDecisionId", "ENGINEERING_DECISION");
    push("changeRequestId", "CHANGE_REQUEST");
    if (branches.length === 0) return [];

    const rows = await client.approval.findMany({
      where: { projectId, OR: branches },
      select: APPROVAL_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => toApprovalEdge(projectId, row));
  },
  async audit(projectId, client) {
    const rows = await client.approval.findMany({
      where: { projectId },
      select: APPROVAL_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => {
      const resolved = approvalTarget(row);
      return {
        type: "APPROVAL_RELATES_TO_OBJECT" as const,
        relationshipId: row.id,
        source: ref("APPROVAL", row.id),
        target: resolved?.target ?? null,
        targetProjectId: resolved?.targetProjectId ?? null,
        linkType: null,
      };
    });
  },
};

// --- Supplier parent edges ------------------------------------------------
//
// Read from the child row's own foreign key rather than from a join table, so
// the child's id is both the edge's provenance and the target node's id — the
// same shape the decision-memory children use.
//
// `SUPPLIED_ITEM_QUALIFIED_BY` reads a *nullable* parent: a SOURCE qualification
// qualifies the supplier rather than any one item, and rows where it is null
// simply produce no edge.

const suppliedItemProjectFilter = (projectId: string) => ({ projectId });

const supplierProvidesItem: EdgeResolver = {
  type: "SUPPLIER_PROVIDES_ITEM",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIER");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItem.findMany({
      where: { supplierId: { in: ids }, projectId, supplier: { projectId } },
      select: { id: true, createdAt: true, supplierId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_PROVIDES_ITEM" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIED_ITEM", row.id),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItem.findMany({
      where: { id: { in: ids }, projectId, supplier: { projectId } },
      select: { id: true, createdAt: true, supplierId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_PROVIDES_ITEM" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIED_ITEM", row.id),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItem.findMany({
      where: suppliedItemProjectFilter(projectId),
      select: { id: true, supplierId: true, supplier: { select: { projectId: true } } },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_PROVIDES_ITEM" as const,
      relationshipId: row.id,
      // The supplier is the source here, so the "target project" the
      // consistency check compares is the item's own — which is the row it
      // found. A supplier in another project shows as the anomaly.
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIED_ITEM", row.id),
      targetProjectId: row.supplier?.projectId ?? null,
      linkType: null,
    }));
  },
};

const supplierHasQualification: EdgeResolver = {
  type: "SUPPLIER_HAS_QUALIFICATION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIER");
    if (ids.length === 0) return [];

    const rows = await client.supplierQualification.findMany({
      where: { supplierId: { in: ids }, projectId, supplier: { projectId } },
      select: { id: true, createdAt: true, supplierId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_HAS_QUALIFICATION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIER_QUALIFICATION", row.id),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIER_QUALIFICATION");
    if (ids.length === 0) return [];

    const rows = await client.supplierQualification.findMany({
      where: { id: { in: ids }, projectId, supplier: { projectId } },
      select: { id: true, createdAt: true, supplierId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_HAS_QUALIFICATION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIER_QUALIFICATION", row.id),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.supplierQualification.findMany({
      where: { projectId },
      select: { id: true, supplierId: true, supplier: { select: { projectId: true } } },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIER_HAS_QUALIFICATION" as const,
      relationshipId: row.id,
      source: ref("SUPPLIER", row.supplierId),
      target: ref("SUPPLIER_QUALIFICATION", row.id),
      targetProjectId: row.supplier?.projectId ?? null,
      linkType: null,
    }));
  },
};

const suppliedItemQualifiedBy: EdgeResolver = {
  type: "SUPPLIED_ITEM_QUALIFIED_BY",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.supplierQualification.findMany({
      where: { suppliedItemId: { in: ids }, projectId, suppliedItem: { projectId } },
      select: { id: true, createdAt: true, suppliedItemId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.suppliedItemId
        ? [
            {
              type: "SUPPLIED_ITEM_QUALIFIED_BY" as const,
              relationshipId: row.id,
              createdAt: row.createdAt,
              createdById: null,
              note: null,
              linkType: null,
              source: ref("SUPPLIED_ITEM", row.suppliedItemId),
              target: ref("SUPPLIER_QUALIFICATION", row.id),
            },
          ]
        : [],
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIER_QUALIFICATION");
    if (ids.length === 0) return [];

    const rows = await client.supplierQualification.findMany({
      where: {
        id: { in: ids },
        suppliedItemId: { not: null },
        projectId,
        suppliedItem: { projectId },
      },
      select: { id: true, createdAt: true, suppliedItemId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.suppliedItemId
        ? [
            {
              type: "SUPPLIED_ITEM_QUALIFIED_BY" as const,
              relationshipId: row.id,
              createdAt: row.createdAt,
              createdById: null,
              note: null,
              linkType: null,
              source: ref("SUPPLIED_ITEM", row.suppliedItemId),
              target: ref("SUPPLIER_QUALIFICATION", row.id),
            },
          ]
        : [],
    );
  },
  async audit(projectId, client) {
    const rows = await client.supplierQualification.findMany({
      where: { projectId, suppliedItemId: { not: null } },
      select: {
        id: true,
        suppliedItemId: true,
        suppliedItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.suppliedItemId
        ? [
            {
              type: "SUPPLIED_ITEM_QUALIFIED_BY" as const,
              relationshipId: row.id,
              source: ref("SUPPLIED_ITEM", row.suppliedItemId),
              target: ref("SUPPLIER_QUALIFICATION", row.id),
              targetProjectId: row.suppliedItem?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

// --- Supplied item → engineering objects ------------------------------------
//
// Five structurally identical join tables. Each is written out rather than
// generated, for the same reason every other resolver here is: the column names
// and relation names are real, and a generated one would need dynamic table
// dispatch — which is exactly what this file exists to avoid.

const SUPPLIED_LINK_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  note: true,
  suppliedItemId: true,
} as const;

const suppliedItemAllocatedToDesign: EdgeResolver = {
  type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemDesignLink.findMany({
      where: {
        suppliedItemId: { in: ids },
        suppliedItem: { projectId },
        designItem: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, designItemId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("DESIGN_ITEM", row.designItemId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DESIGN_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemDesignLink.findMany({
      where: { designItemId: { in: ids }, suppliedItem: { projectId }, designItem: { projectId } },
      select: { ...SUPPLIED_LINK_SELECT, designItemId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("DESIGN_ITEM", row.designItemId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItemDesignLink.findMany({
      where: { suppliedItem: { projectId } },
      select: {
        id: true,
        suppliedItemId: true,
        designItemId: true,
        designItem: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN" as const,
      relationshipId: row.id,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("DESIGN_ITEM", row.designItemId),
      targetProjectId: row.designItem?.projectId ?? null,
      linkType: null,
    }));
  },
};

const suppliedItemSupportsRequirement: EdgeResolver = {
  type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemRequirementLink.findMany({
      where: {
        suppliedItemId: { in: ids },
        suppliedItem: { projectId },
        requirement: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, requirementId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("REQUIREMENT", row.requirementId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "REQUIREMENT");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemRequirementLink.findMany({
      where: {
        requirementId: { in: ids },
        suppliedItem: { projectId },
        requirement: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, requirementId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("REQUIREMENT", row.requirementId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItemRequirementLink.findMany({
      where: { suppliedItem: { projectId } },
      select: {
        id: true,
        suppliedItemId: true,
        requirementId: true,
        requirement: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT" as const,
      relationshipId: row.id,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("REQUIREMENT", row.requirementId),
      targetProjectId: row.requirement?.projectId ?? null,
      linkType: null,
    }));
  },
};

const suppliedItemRequiresVerification: EdgeResolver = {
  type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemVerificationLink.findMany({
      where: {
        suppliedItemId: { in: ids },
        suppliedItem: { projectId },
        verificationActivity: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, verificationActivityId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "VERIFICATION_ACTIVITY");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemVerificationLink.findMany({
      where: {
        verificationActivityId: { in: ids },
        suppliedItem: { projectId },
        verificationActivity: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, verificationActivityId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItemVerificationLink.findMany({
      where: { suppliedItem: { projectId } },
      select: {
        id: true,
        suppliedItemId: true,
        verificationActivityId: true,
        verificationActivity: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_REQUIRES_VERIFICATION" as const,
      relationshipId: row.id,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("VERIFICATION_ACTIVITY", row.verificationActivityId),
      targetProjectId: row.verificationActivity?.projectId ?? null,
      linkType: null,
    }));
  },
};

const suppliedItemLinkedToDecision: EdgeResolver = {
  type: "SUPPLIED_ITEM_LINKED_TO_DECISION",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemDecisionLink.findMany({
      where: {
        suppliedItemId: { in: ids },
        suppliedItem: { projectId },
        engineeringDecision: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, engineeringDecisionId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_DECISION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_DECISION");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemDecisionLink.findMany({
      where: {
        engineeringDecisionId: { in: ids },
        suppliedItem: { projectId },
        engineeringDecision: { projectId },
      },
      select: { ...SUPPLIED_LINK_SELECT, engineeringDecisionId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_DECISION" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItemDecisionLink.findMany({
      where: { suppliedItem: { projectId } },
      select: {
        id: true,
        suppliedItemId: true,
        engineeringDecisionId: true,
        engineeringDecision: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_DECISION" as const,
      relationshipId: row.id,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("ENGINEERING_DECISION", row.engineeringDecisionId),
      targetProjectId: row.engineeringDecision?.projectId ?? null,
      linkType: null,
    }));
  },
};

const suppliedItemLinkedToRisk: EdgeResolver = {
  type: "SUPPLIED_ITEM_LINKED_TO_RISK",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemRiskLink.findMany({
      where: { suppliedItemId: { in: ids }, suppliedItem: { projectId }, risk: { projectId } },
      select: { ...SUPPLIED_LINK_SELECT, riskId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_RISK" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("RISK", row.riskId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "RISK");
    if (ids.length === 0) return [];

    const rows = await client.suppliedItemRiskLink.findMany({
      where: { riskId: { in: ids }, suppliedItem: { projectId }, risk: { projectId } },
      select: { ...SUPPLIED_LINK_SELECT, riskId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_RISK" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: row.note,
      linkType: null,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("RISK", row.riskId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.suppliedItemRiskLink.findMany({
      where: { suppliedItem: { projectId } },
      select: {
        id: true,
        suppliedItemId: true,
        riskId: true,
        risk: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM_LINKED_TO_RISK" as const,
      relationshipId: row.id,
      source: ref("SUPPLIED_ITEM", row.suppliedItemId),
      target: ref("RISK", row.riskId),
      targetProjectId: row.risk?.projectId ?? null,
      linkType: null,
    }));
  },
};

// --- Supplier-side evidence -------------------------------------------------
//
// Two more variants of the shared `evidence_links` table, each filtering on its
// own subject column. The widened CHECK constraint still guarantees exactly one
// subject per row, so these never see each other's rows.

const suppliedItemHasEvidence: EdgeResolver = {
  type: "SUPPLIED_ITEM_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIED_ITEM");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: { suppliedItemId: { in: ids }, suppliedItem: { projectId }, evidence: { projectId } },
      select: { ...EVIDENCE_LINK_SELECT, suppliedItemId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge("SUPPLIED_ITEM_HAS_EVIDENCE", "SUPPLIED_ITEM", row.suppliedItemId, row),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        evidenceId: { in: ids },
        suppliedItemId: { not: null },
        suppliedItem: { projectId },
        evidence: { projectId },
      },
      select: { ...EVIDENCE_LINK_SELECT, suppliedItemId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge("SUPPLIED_ITEM_HAS_EVIDENCE", "SUPPLIED_ITEM", row.suppliedItemId, row),
    );
  },
  async audit(projectId, client) {
    const rows = await client.evidenceLink.findMany({
      where: { suppliedItemId: { not: null }, suppliedItem: { projectId } },
      select: {
        id: true,
        evidenceId: true,
        suppliedItemId: true,
        evidence: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.suppliedItemId
        ? [
            {
              type: "SUPPLIED_ITEM_HAS_EVIDENCE" as const,
              relationshipId: row.id,
              source: ref("SUPPLIED_ITEM", row.suppliedItemId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

const qualificationHasEvidence: EdgeResolver = {
  type: "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "SUPPLIER_QUALIFICATION");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        supplierQualificationId: { in: ids },
        supplierQualification: { projectId },
        evidence: { projectId },
      },
      select: { ...EVIDENCE_LINK_SELECT, supplierQualificationId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
        "SUPPLIER_QUALIFICATION",
        row.supplierQualificationId,
        row,
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];

    const rows = await client.evidenceLink.findMany({
      where: {
        evidenceId: { in: ids },
        supplierQualificationId: { not: null },
        supplierQualification: { projectId },
        evidence: { projectId },
      },
      select: { ...EVIDENCE_LINK_SELECT, supplierQualificationId: true },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      toEvidenceEdge(
        "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
        "SUPPLIER_QUALIFICATION",
        row.supplierQualificationId,
        row,
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.evidenceLink.findMany({
      where: { supplierQualificationId: { not: null }, supplierQualification: { projectId } },
      select: {
        id: true,
        evidenceId: true,
        supplierQualificationId: true,
        evidence: { select: { projectId: true } },
      },
      orderBy: ORDER,
    });
    return rows.flatMap((row) =>
      row.supplierQualificationId
        ? [
            {
              type: "SUPPLIER_QUALIFICATION_HAS_EVIDENCE" as const,
              relationshipId: row.id,
              source: ref("SUPPLIER_QUALIFICATION", row.supplierQualificationId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );
  },
};

// --- Design / operations drift ---------------------------------------------
//
// All six are read from a child row's own foreign key, so the child's id is
// both the edge's provenance and the target node's id.
//
// These make drift *traversable* — from a design item to what was baselined
// about it and what has since been observed. They carry no impact: see
// IMPACT_PROPAGATION, where every one of them is inert in both directions.

const BASELINE_MEMBER_SELECT = {
  id: true,
  createdAt: true,
  baselineId: true,
  nodeType: true,
  nodeId: true,
} as const;

/** The baseline member's `nodeType` enum maps 1:1 onto a graph node type. */
function memberTargetType(nodeType: string): GraphNodeType {
  return nodeType as GraphNodeType;
}

const baselineHasMember: EdgeResolver = {
  type: "BASELINE_HAS_MEMBER",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_BASELINE");
    if (ids.length === 0) return [];

    const rows = await client.engineeringBaselineMember.findMany({
      where: { baselineId: { in: ids }, baseline: { projectId } },
      select: BASELINE_MEMBER_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_HAS_MEMBER" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("ENGINEERING_BASELINE", row.baselineId),
      target: ref("BASELINE_MEMBER", row.id),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "BASELINE_MEMBER");
    if (ids.length === 0) return [];

    const rows = await client.engineeringBaselineMember.findMany({
      where: { id: { in: ids }, baseline: { projectId } },
      select: BASELINE_MEMBER_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_HAS_MEMBER" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("ENGINEERING_BASELINE", row.baselineId),
      target: ref("BASELINE_MEMBER", row.id),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.engineeringBaselineMember.findMany({
      where: { baseline: { projectId } },
      select: { id: true, baselineId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_HAS_MEMBER" as const,
      relationshipId: row.id,
      source: ref("ENGINEERING_BASELINE", row.baselineId),
      target: ref("BASELINE_MEMBER", row.id),
      // The member reaches the project only through its baseline, so it can
      // never be cross-project.
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const baselineMemberReferencesObject: EdgeResolver = {
  type: "BASELINE_MEMBER_REFERENCES_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "BASELINE_MEMBER");
    if (ids.length === 0) return [];

    const rows = await client.engineeringBaselineMember.findMany({
      where: { id: { in: ids }, baseline: { projectId } },
      select: BASELINE_MEMBER_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_MEMBER_REFERENCES_OBJECT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("BASELINE_MEMBER", row.id),
      target: ref(memberTargetType(row.nodeType), row.nodeId),
    }));
  },
  async incoming(projectId, refs, client) {
    // The member's target is a (type, id) pair rather than a foreign key, so
    // the frontier is matched on both columns.
    const branches = refs
      .filter((candidate) => candidate.type !== "BASELINE_MEMBER")
      .map((candidate) => ({ nodeType: candidate.type, nodeId: candidate.id }));
    if (branches.length === 0) return [];

    const rows = await client.engineeringBaselineMember.findMany({
      where: {
        baseline: { projectId },
        OR: branches as never,
      },
      select: BASELINE_MEMBER_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_MEMBER_REFERENCES_OBJECT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("BASELINE_MEMBER", row.id),
      target: ref(memberTargetType(row.nodeType), row.nodeId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.engineeringBaselineMember.findMany({
      where: { baseline: { projectId } },
      select: { id: true, nodeType: true, nodeId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "BASELINE_MEMBER_REFERENCES_OBJECT" as const,
      relationshipId: row.id,
      source: ref("BASELINE_MEMBER", row.id),
      target: ref(memberTargetType(row.nodeType), row.nodeId),
      // Membership is validated against the project on write; a member whose
      // object has since been deleted resolves to nothing rather than to
      // another project's row.
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const OBSERVATION_SELECT = {
  id: true,
  createdAt: true,
  createdById: true,
  designItemId: true,
  decisionExpectationId: true,
  suppliedItemId: true,
} as const;

interface ObservationRow {
  id: string;
  createdAt: Date;
  createdById: string | null;
  designItemId: string | null;
  decisionExpectationId: string | null;
  suppliedItemId: string | null;
}

/** Reads whichever single subject column an observation row has set. */
function observationTarget(row: ObservationRow): GraphNodeRef | null {
  if (row.designItemId) return ref("DESIGN_ITEM", row.designItemId);
  if (row.decisionExpectationId) {
    return ref("DECISION_EXPECTATION", row.decisionExpectationId);
  }
  if (row.suppliedItemId) return ref("SUPPLIED_ITEM", row.suppliedItemId);
  // An observation may legitimately have no subject at all.
  return null;
}

function toObservationEdge(row: ObservationRow): RawEdge[] {
  const target = observationTarget(row);
  if (!target) return [];

  return [
    {
      type: "OBSERVATION_CONCERNS_OBJECT",
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.createdById,
      note: null,
      linkType: null,
      source: ref("OPERATIONAL_OBSERVATION", row.id),
      target,
    },
  ];
}

const observationConcernsObject: EdgeResolver = {
  type: "OBSERVATION_CONCERNS_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "OPERATIONAL_OBSERVATION");
    if (ids.length === 0) return [];

    const rows = await client.operationalObservation.findMany({
      where: { id: { in: ids }, projectId },
      select: OBSERVATION_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap(toObservationEdge);
  },
  async incoming(projectId, refs, client) {
    const branches: Record<string, { in: string[] }>[] = [];
    const push = (column: string, type: GraphNodeType) => {
      const ids = idsOfType(refs, type);
      if (ids.length > 0) branches.push({ [column]: { in: ids } });
    };
    push("designItemId", "DESIGN_ITEM");
    push("decisionExpectationId", "DECISION_EXPECTATION");
    push("suppliedItemId", "SUPPLIED_ITEM");
    if (branches.length === 0) return [];

    const rows = await client.operationalObservation.findMany({
      where: { projectId, OR: branches },
      select: OBSERVATION_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap(toObservationEdge);
  },
  async audit(projectId, client) {
    const rows = await client.operationalObservation.findMany({
      where: { projectId },
      select: OBSERVATION_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => {
      const target = observationTarget(row);
      // An observation with no subject is a valid record, not an anomaly, so
      // it simply yields no edge to check.
      if (!target) return [];
      return [
        {
          type: "OBSERVATION_CONCERNS_OBJECT" as const,
          relationshipId: row.id,
          source: ref("OPERATIONAL_OBSERVATION", row.id),
          target,
          targetProjectId: projectId,
          linkType: null,
        },
      ];
    });
  },
};

const driftAssessmentAgainstBaseline: EdgeResolver = {
  type: "DRIFT_ASSESSMENT_AGAINST_BASELINE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "DRIFT_ASSESSMENT");
    if (ids.length === 0) return [];

    const rows = await client.driftAssessment.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, createdAt: true, evaluatedById: true, baselineId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_AGAINST_BASELINE" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.evaluatedById,
      note: null,
      linkType: null,
      source: ref("DRIFT_ASSESSMENT", row.id),
      target: ref("ENGINEERING_BASELINE", row.baselineId),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "ENGINEERING_BASELINE");
    if (ids.length === 0) return [];

    const rows = await client.driftAssessment.findMany({
      where: { baselineId: { in: ids }, projectId, baseline: { projectId } },
      select: { id: true, createdAt: true, evaluatedById: true, baselineId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_AGAINST_BASELINE" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: row.evaluatedById,
      note: null,
      linkType: null,
      source: ref("DRIFT_ASSESSMENT", row.id),
      target: ref("ENGINEERING_BASELINE", row.baselineId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.driftAssessment.findMany({
      where: { projectId },
      select: { id: true, baselineId: true, baseline: { select: { projectId: true } } },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_AGAINST_BASELINE" as const,
      relationshipId: row.id,
      source: ref("DRIFT_ASSESSMENT", row.id),
      target: ref("ENGINEERING_BASELINE", row.baselineId),
      targetProjectId: row.baseline?.projectId ?? null,
      linkType: null,
    }));
  },
};

const DRIFT_FINDING_SELECT = {
  id: true,
  createdAt: true,
  assessmentId: true,
} as const;

const driftAssessmentHasFinding: EdgeResolver = {
  type: "DRIFT_ASSESSMENT_HAS_FINDING",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "DRIFT_ASSESSMENT");
    if (ids.length === 0) return [];

    const rows = await client.driftFinding.findMany({
      where: { assessmentId: { in: ids }, assessment: { projectId } },
      select: DRIFT_FINDING_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_HAS_FINDING" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("DRIFT_ASSESSMENT", row.assessmentId),
      target: ref("DRIFT_FINDING", row.id),
    }));
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "DRIFT_FINDING");
    if (ids.length === 0) return [];

    const rows = await client.driftFinding.findMany({
      where: { id: { in: ids }, assessment: { projectId } },
      select: DRIFT_FINDING_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_HAS_FINDING" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("DRIFT_ASSESSMENT", row.assessmentId),
      target: ref("DRIFT_FINDING", row.id),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.driftFinding.findMany({
      where: { assessment: { projectId } },
      select: { id: true, assessmentId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT_HAS_FINDING" as const,
      relationshipId: row.id,
      source: ref("DRIFT_ASSESSMENT", row.assessmentId),
      target: ref("DRIFT_FINDING", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const FINDING_SUBJECT_SELECT = {
  id: true,
  createdAt: true,
  baselineSubjectType: true,
  baselineSubjectId: true,
  observationSubjectType: true,
  observationSubjectId: true,
} as const;

interface FindingSubjectRow {
  id: string;
  createdAt: Date;
  baselineSubjectType: string | null;
  baselineSubjectId: string | null;
  observationSubjectType: string | null;
  observationSubjectId: string | null;
}

/**
 * A finding points at whichever subject it actually has.
 *
 * The baseline subject is preferred: it names the engineering object the
 * comparison was about. A finding with neither — the scope rule, for instance —
 * yields no edge.
 */
function findingTarget(row: FindingSubjectRow): GraphNodeRef | null {
  if (row.baselineSubjectType && row.baselineSubjectId) {
    return ref(row.baselineSubjectType as GraphNodeType, row.baselineSubjectId);
  }
  if (row.observationSubjectType && row.observationSubjectId) {
    return ref(row.observationSubjectType as GraphNodeType, row.observationSubjectId);
  }
  return null;
}

function toFindingEdge(row: FindingSubjectRow): RawEdge[] {
  const target = findingTarget(row);
  if (!target) return [];
  // A finding whose subject is the project itself is scope context, not an
  // edge into the engineering record.
  if (target.type === ("PROJECT" as GraphNodeType)) return [];

  return [
    {
      type: "DRIFT_FINDING_CONCERNS_OBJECT",
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("DRIFT_FINDING", row.id),
      target,
    },
  ];
}

const driftFindingConcernsObject: EdgeResolver = {
  type: "DRIFT_FINDING_CONCERNS_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "DRIFT_FINDING");
    if (ids.length === 0) return [];

    const rows = await client.driftFinding.findMany({
      where: { id: { in: ids }, assessment: { projectId } },
      select: FINDING_SUBJECT_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap(toFindingEdge);
  },
  async incoming(projectId, refs, client) {
    const branches = refs
      .filter((candidate) => candidate.type !== "DRIFT_FINDING")
      .flatMap((candidate) => [
        { baselineSubjectType: candidate.type, baselineSubjectId: candidate.id },
        { observationSubjectType: candidate.type, observationSubjectId: candidate.id },
      ]);
    if (branches.length === 0) return [];

    const rows = await client.driftFinding.findMany({
      where: { assessment: { projectId }, OR: branches },
      select: FINDING_SUBJECT_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap(toFindingEdge);
  },
  async audit(projectId, client) {
    const rows = await client.driftFinding.findMany({
      where: { assessment: { projectId } },
      select: FINDING_SUBJECT_SELECT,
      orderBy: ORDER,
    });
    return rows.flatMap((row) => {
      const target = findingTarget(row);
      if (!target || target.type === ("PROJECT" as GraphNodeType)) return [];
      return [
        {
          type: "DRIFT_FINDING_CONCERNS_OBJECT" as const,
          relationshipId: row.id,
          source: ref("DRIFT_FINDING", row.id),
          target,
          targetProjectId: projectId,
          linkType: null,
        },
      ];
    });
  },
};

// --- Certification workspace -------------------------------------------------
//
// Five plain parent-has-child edges (mirroring baselineHasMember exactly), one
// genuinely new shape — a single edge type resolved by combining eight
// separate tables, seven dedicated join tables plus the shared evidence_links
// table — and one polymorphic-subject edge resolved the same way
// driftFindingConcernsObject reads DriftFinding's own subject columns.

function structuralEdge(
  type: GraphEdgeType,
  relationshipId: string,
  createdAt: Date,
  source: GraphNodeRef,
  target: GraphNodeRef,
): RawEdge {
  return { type, relationshipId, createdAt, createdById: null, note: null, linkType: null, source, target };
}

const certificationProgramHasBasis: EdgeResolver = {
  type: "CERTIFICATION_PROGRAM_HAS_BASIS",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_PROGRAM");
    if (ids.length === 0) return [];
    const rows = await client.certificationBasis.findMany({
      where: { certificationProgramId: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, createdAt: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_PROGRAM_HAS_BASIS",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
        ref("CERTIFICATION_BASIS", row.id),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_BASIS");
    if (ids.length === 0) return [];
    const rows = await client.certificationBasis.findMany({
      where: { id: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, createdAt: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_PROGRAM_HAS_BASIS",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
        ref("CERTIFICATION_BASIS", row.id),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.certificationBasis.findMany({
      where: { certificationProgram: { projectId } },
      select: { id: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_PROGRAM_HAS_BASIS" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
      target: ref("CERTIFICATION_BASIS", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const certificationProgramHasReview: EdgeResolver = {
  type: "CERTIFICATION_PROGRAM_HAS_REVIEW",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_PROGRAM");
    if (ids.length === 0) return [];
    const rows = await client.certificationReview.findMany({
      where: { certificationProgramId: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, createdAt: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_PROGRAM_HAS_REVIEW",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
        ref("CERTIFICATION_REVIEW", row.id),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_REVIEW");
    if (ids.length === 0) return [];
    const rows = await client.certificationReview.findMany({
      where: { id: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, createdAt: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_PROGRAM_HAS_REVIEW",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
        ref("CERTIFICATION_REVIEW", row.id),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.certificationReview.findMany({
      where: { certificationProgram: { projectId } },
      select: { id: true, certificationProgramId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_PROGRAM_HAS_REVIEW" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_PROGRAM", row.certificationProgramId),
      target: ref("CERTIFICATION_REVIEW", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const certificationBasisHasComplianceItem: EdgeResolver = {
  type: "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_BASIS");
    if (ids.length === 0) return [];
    const rows = await client.complianceItem.findMany({
      where: {
        certificationBasisId: { in: ids },
        certificationBasis: { certificationProgram: { projectId } },
      },
      select: { id: true, createdAt: true, certificationBasisId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_BASIS", row.certificationBasisId),
        ref("COMPLIANCE_ITEM", row.id),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "COMPLIANCE_ITEM");
    if (ids.length === 0) return [];
    const rows = await client.complianceItem.findMany({
      where: { id: { in: ids }, certificationBasis: { certificationProgram: { projectId } } },
      select: { id: true, createdAt: true, certificationBasisId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_BASIS", row.certificationBasisId),
        ref("COMPLIANCE_ITEM", row.id),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.complianceItem.findMany({
      where: { certificationBasis: { certificationProgram: { projectId } } },
      select: { id: true, certificationBasisId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_BASIS", row.certificationBasisId),
      target: ref("COMPLIANCE_ITEM", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

const complianceItemHasFinding: EdgeResolver = {
  type: "COMPLIANCE_ITEM_HAS_FINDING",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "COMPLIANCE_ITEM");
    if (ids.length === 0) return [];
    const rows = await client.certificationFinding.findMany({
      where: {
        complianceItemId: { in: ids },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, createdAt: true, complianceItemId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "COMPLIANCE_ITEM_HAS_FINDING",
        row.id,
        row.createdAt,
        ref("COMPLIANCE_ITEM", row.complianceItemId),
        ref("CERTIFICATION_FINDING", row.id),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_FINDING");
    if (ids.length === 0) return [];
    const rows = await client.certificationFinding.findMany({
      where: {
        id: { in: ids },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, createdAt: true, complianceItemId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "COMPLIANCE_ITEM_HAS_FINDING",
        row.id,
        row.createdAt,
        ref("COMPLIANCE_ITEM", row.complianceItemId),
        ref("CERTIFICATION_FINDING", row.id),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.certificationFinding.findMany({
      where: { complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
      select: { id: true, complianceItemId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "COMPLIANCE_ITEM_HAS_FINDING" as const,
      relationshipId: row.id,
      source: ref("COMPLIANCE_ITEM", row.complianceItemId),
      target: ref("CERTIFICATION_FINDING", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

/**
 * The one edge this capability added: `CertificationFinding.evidenceId` is a
 * real, plain foreign key — evidence named as a finding's supporting record
 * on resolution or acceptance — that existed in the schema but was absent
 * from the graph before now. Not a join table, so there is at most one row
 * per finding; `relationshipId` is the finding's own id.
 */
const certificationFindingHasEvidence: EdgeResolver = {
  type: "CERTIFICATION_FINDING_HAS_EVIDENCE",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_FINDING");
    if (ids.length === 0) return [];
    const rows = await client.certificationFinding.findMany({
      where: {
        id: { in: ids },
        evidenceId: { not: null },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, createdAt: true, evidenceId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_FINDING_HAS_EVIDENCE",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_FINDING", row.id),
        ref("EVIDENCE", row.evidenceId as string),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "EVIDENCE");
    if (ids.length === 0) return [];
    const rows = await client.certificationFinding.findMany({
      where: {
        evidenceId: { in: ids },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, createdAt: true, evidenceId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_FINDING_HAS_EVIDENCE",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_FINDING", row.id),
        ref("EVIDENCE", row.evidenceId as string),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.certificationFinding.findMany({
      where: {
        evidenceId: { not: null },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, evidenceId: true, evidence: { select: { projectId: true } } },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_FINDING_HAS_EVIDENCE" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_FINDING", row.id),
      target: ref("EVIDENCE", row.evidenceId as string),
      targetProjectId: row.evidence?.projectId ?? null,
      linkType: null,
    }));
  },
};

const certificationReviewHasFinding: EdgeResolver = {
  type: "CERTIFICATION_REVIEW_HAS_FINDING",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_REVIEW");
    if (ids.length === 0) return [];
    const rows = await client.certificationReviewFinding.findMany({
      where: { reviewId: { in: ids }, review: { certificationProgram: { projectId } } },
      select: { id: true, createdAt: true, reviewId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_REVIEW_HAS_FINDING",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_REVIEW", row.reviewId),
        ref("CERTIFICATION_REVIEW_FINDING", row.id),
      ),
    );
  },
  async incoming(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_REVIEW_FINDING");
    if (ids.length === 0) return [];
    const rows = await client.certificationReviewFinding.findMany({
      where: { id: { in: ids }, review: { certificationProgram: { projectId } } },
      select: { id: true, createdAt: true, reviewId: true },
      orderBy: ORDER,
    });
    return rows.map((row) =>
      structuralEdge(
        "CERTIFICATION_REVIEW_HAS_FINDING",
        row.id,
        row.createdAt,
        ref("CERTIFICATION_REVIEW", row.reviewId),
        ref("CERTIFICATION_REVIEW_FINDING", row.id),
      ),
    );
  },
  async audit(projectId, client) {
    const rows = await client.certificationReviewFinding.findMany({
      where: { review: { certificationProgram: { projectId } } },
      select: { id: true, reviewId: true },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW_HAS_FINDING" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_REVIEW", row.reviewId),
      target: ref("CERTIFICATION_REVIEW_FINDING", row.id),
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

/**
 * ComplianceItem's engineering basis: seven dedicated join tables plus the
 * shared `evidence_links` table for the eighth (Evidence) target. One edge
 * type, read from eight tables — a new shape in this file, but a natural
 * generalization of the single-table polymorphic resolvers above: each query
 * is still batched and still constrains both endpoints to the project.
 */
const COMPLIANCE_LINK_TABLES: ReadonlyArray<{
  targetType: GraphNodeType;
  findMany: (
    projectId: string,
    where: Record<string, unknown>,
    client: DbClient,
  ) => Promise<Array<{ id: string; createdAt: Date; createdById: string | null; note: string | null; complianceItemId: string; targetId: string }>>;
}> = [
  {
    targetType: "REQUIREMENT",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemRequirementLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, requirementId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.requirementId })),
  },
  {
    targetType: "VERIFICATION_ACTIVITY",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemVerificationLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, verificationActivityId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.verificationActivityId })),
  },
  {
    targetType: "ENGINEERING_DECISION",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemDecisionLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, engineeringDecisionId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.engineeringDecisionId })),
  },
  {
    targetType: "DESIGN_ITEM",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemDesignLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, designItemId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.designItemId })),
  },
  {
    targetType: "RISK",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemRiskLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, riskId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.riskId })),
  },
  {
    targetType: "ISSUE",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemIssueLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, issueId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.issueId })),
  },
  {
    targetType: "SUPPLIER_QUALIFICATION",
    findMany: async (_projectId, where, client) =>
      (
        await client.complianceItemSupplierQualificationLink.findMany({
          where,
          select: { id: true, createdAt: true, createdById: true, note: true, complianceItemId: true, supplierQualificationId: true },
          orderBy: ORDER,
        })
      ).map((row) => ({ ...row, targetId: row.supplierQualificationId })),
  },
];

const complianceItemLinkedToObject: EdgeResolver = {
  type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "COMPLIANCE_ITEM");
    if (ids.length === 0) return [];

    const tableEdges = (
      await Promise.all(
        COMPLIANCE_LINK_TABLES.map(async (table) => {
          const rows = await table.findMany(
            projectId,
            { complianceItemId: { in: ids }, complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
            client,
          );
          return rows.map((row) => ({
            type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT" as const,
            relationshipId: row.id,
            createdAt: row.createdAt,
            createdById: row.createdById,
            note: row.note,
            linkType: null,
            source: ref("COMPLIANCE_ITEM", row.complianceItemId),
            target: ref(table.targetType, row.targetId),
          }));
        }),
      )
    ).flat();

    const evidenceRows = await client.evidenceLink.findMany({
      where: { complianceItemId: { in: ids }, evidence: { projectId } },
      select: { ...EVIDENCE_LINK_SELECT, complianceItemId: true },
      orderBy: ORDER,
    });
    const evidenceEdges = evidenceRows.flatMap((row) =>
      toEvidenceEdge("COMPLIANCE_ITEM_LINKED_TO_OBJECT", "COMPLIANCE_ITEM", row.complianceItemId ?? null, row),
    );

    return [...tableEdges, ...evidenceEdges];
  },
  async incoming(projectId, refs, client) {
    const results: RawEdge[] = [];

    for (const table of COMPLIANCE_LINK_TABLES) {
      const ids = idsOfType(refs, table.targetType);
      if (ids.length === 0) continue;
      const columnName =
        table.targetType === "REQUIREMENT"
          ? "requirementId"
          : table.targetType === "VERIFICATION_ACTIVITY"
            ? "verificationActivityId"
            : table.targetType === "ENGINEERING_DECISION"
              ? "engineeringDecisionId"
              : table.targetType === "DESIGN_ITEM"
                ? "designItemId"
                : table.targetType === "RISK"
                  ? "riskId"
                  : table.targetType === "ISSUE"
                    ? "issueId"
                    : "supplierQualificationId";
      const rows = await table.findMany(
        projectId,
        { [columnName]: { in: ids }, complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
        client,
      );
      for (const row of rows) {
        results.push({
          type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT",
          relationshipId: row.id,
          createdAt: row.createdAt,
          createdById: row.createdById,
          note: row.note,
          linkType: null,
          source: ref("COMPLIANCE_ITEM", row.complianceItemId),
          target: ref(table.targetType, row.targetId),
        });
      }
    }

    if (idsOfType(refs, "EVIDENCE").length > 0) {
      const evidenceIds = idsOfType(refs, "EVIDENCE");
      const evidenceRows = await client.evidenceLink.findMany({
        where: { evidenceId: { in: evidenceIds }, complianceItemId: { not: null }, evidence: { projectId } },
        select: { ...EVIDENCE_LINK_SELECT, complianceItemId: true },
        orderBy: ORDER,
      });
      results.push(
        ...evidenceRows.flatMap((row) =>
          toEvidenceEdge("COMPLIANCE_ITEM_LINKED_TO_OBJECT", "COMPLIANCE_ITEM", row.complianceItemId ?? null, row),
        ),
      );
    }

    return results;
  },
  async audit(projectId, client) {
    const tableEdges = (
      await Promise.all(
        COMPLIANCE_LINK_TABLES.map(async (table) => {
          const rows = await table.findMany(
            projectId,
            { complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
            client,
          );
          return rows.map((row) => ({
            type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT" as const,
            relationshipId: row.id,
            source: ref("COMPLIANCE_ITEM", row.complianceItemId),
            target: ref(table.targetType, row.targetId),
            // Every one of these targets is validated project-scoped at write
            // time, so it can never resolve outside this project.
            targetProjectId: projectId,
            linkType: null,
          }));
        }),
      )
    ).flat();

    const evidenceRows = await client.evidenceLink.findMany({
      where: { complianceItemId: { not: null }, complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
      select: { id: true, evidenceId: true, complianceItemId: true, evidence: { select: { projectId: true } } },
      orderBy: ORDER,
    });
    const evidenceEdges = evidenceRows.flatMap((row) =>
      row.complianceItemId
        ? [
            {
              type: "COMPLIANCE_ITEM_LINKED_TO_OBJECT" as const,
              relationshipId: row.id,
              source: ref("COMPLIANCE_ITEM", row.complianceItemId),
              target: ref("EVIDENCE", row.evidenceId),
              targetProjectId: row.evidence?.projectId ?? null,
              linkType: null,
            },
          ]
        : [],
    );

    return [...tableEdges, ...evidenceEdges];
  },
};

const CERTIFICATION_REVIEW_FINDING_SELECT = {
  id: true,
  createdAt: true,
  reviewId: true,
  subjectType: true,
  subjectId: true,
} as const;

/** A review finding's `subjectType` string maps 1:1 onto a graph node type. */
function reviewFindingSubjectType(subjectType: string): GraphNodeType {
  return subjectType as GraphNodeType;
}

const certificationReviewFindingConcernsObject: EdgeResolver = {
  type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT",
  async outgoing(projectId, refs, client) {
    const ids = idsOfType(refs, "CERTIFICATION_REVIEW_FINDING");
    if (ids.length === 0) return [];
    const rows = await client.certificationReviewFinding.findMany({
      where: { id: { in: ids }, review: { certificationProgram: { projectId } } },
      select: CERTIFICATION_REVIEW_FINDING_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("CERTIFICATION_REVIEW_FINDING", row.id),
      target: ref(reviewFindingSubjectType(row.subjectType), row.subjectId),
    }));
  },
  async incoming(projectId, refs, client) {
    const branches = refs.map((candidate) => ({ subjectType: candidate.type, subjectId: candidate.id }));
    if (branches.length === 0) return [];
    const rows = await client.certificationReviewFinding.findMany({
      where: { review: { certificationProgram: { projectId } }, OR: branches },
      select: CERTIFICATION_REVIEW_FINDING_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT" as const,
      relationshipId: row.id,
      createdAt: row.createdAt,
      createdById: null,
      note: null,
      linkType: null,
      source: ref("CERTIFICATION_REVIEW_FINDING", row.id),
      target: ref(reviewFindingSubjectType(row.subjectType), row.subjectId),
    }));
  },
  async audit(projectId, client) {
    const rows = await client.certificationReviewFinding.findMany({
      where: { review: { certificationProgram: { projectId } } },
      select: CERTIFICATION_REVIEW_FINDING_SELECT,
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT" as const,
      relationshipId: row.id,
      source: ref("CERTIFICATION_REVIEW_FINDING", row.id),
      target: ref(reviewFindingSubjectType(row.subjectType), row.subjectId),
      // The subject is always resolved inside this project at evaluation
      // time, so it can never point outside it.
      targetProjectId: projectId,
      linkType: null,
    }));
  },
};

/**
 * Every resolver, keyed by edge type.
 *
 * The registry in `@/domain/graph` declares what an edge *means*; this declares
 * how to read it. Adding a relationship means one entry in each — and the
 * `Record<GraphEdgeType, …>` type makes the compiler enforce that this stays
 * exhaustive.
 */
export const EDGE_RESOLVERS: Readonly<Record<GraphEdgeType, EdgeResolver>> = {
  STAKEHOLDER_NEED_DERIVES_REQUIREMENT: needDerivesRequirement,
  REQUIREMENT_DEPENDS_ON_REQUIREMENT: requirementDependsOnRequirement,
  REQUIREMENT_ALLOCATED_TO_DESIGN: requirementAllocatedToDesign,
  REQUIREMENT_VERIFIED_BY: requirementVerifiedBy,
  REQUIREMENT_LINKED_TO_DECISION: requirementLinkedToDecision,
  REQUIREMENT_HAS_EVIDENCE: requirementHasEvidence,
  DECISION_AFFECTS_DESIGN: decisionAffectsDesign,
  DECISION_AFFECTS_RISK: decisionAffectsRisk,
  DECISION_AFFECTS_ISSUE: decisionAffectsIssue,
  DECISION_HAS_EVIDENCE: decisionHasEvidence,
  DECISION_HAS_ALTERNATIVE: decisionHasAlternative,
  DECISION_HAS_ASSUMPTION: decisionHasAssumption,
  DECISION_HAS_EXPECTATION: decisionHasExpectation,
  DESIGN_CHILD_OF_DESIGN: designChildOfDesign,
  DESIGN_CONNECTS_INTERFACE: designConnectsInterface,
  VERIFICATION_HAS_EVIDENCE: verificationHasEvidence,
  RISK_AFFECTS_REQUIREMENT: riskAffectsRequirement,
  RISK_AFFECTS_DESIGN: riskAffectsDesign,
  ISSUE_AFFECTS_REQUIREMENT: issueAffectsRequirement,
  ISSUE_AFFECTS_DESIGN: issueAffectsDesign,
  CHANGE_IMPACTS_OBJECT: changeImpactsObject,
  APPROVAL_RELATES_TO_OBJECT: approvalRelatesToObject,
  SUPPLIER_PROVIDES_ITEM: supplierProvidesItem,
  SUPPLIER_HAS_QUALIFICATION: supplierHasQualification,
  SUPPLIED_ITEM_QUALIFIED_BY: suppliedItemQualifiedBy,
  SUPPLIED_ITEM_ALLOCATED_TO_DESIGN: suppliedItemAllocatedToDesign,
  SUPPLIED_ITEM_SUPPORTS_REQUIREMENT: suppliedItemSupportsRequirement,
  SUPPLIED_ITEM_REQUIRES_VERIFICATION: suppliedItemRequiresVerification,
  SUPPLIED_ITEM_LINKED_TO_DECISION: suppliedItemLinkedToDecision,
  SUPPLIED_ITEM_LINKED_TO_RISK: suppliedItemLinkedToRisk,
  SUPPLIED_ITEM_HAS_EVIDENCE: suppliedItemHasEvidence,
  SUPPLIER_QUALIFICATION_HAS_EVIDENCE: qualificationHasEvidence,
  BASELINE_HAS_MEMBER: baselineHasMember,
  BASELINE_MEMBER_REFERENCES_OBJECT: baselineMemberReferencesObject,
  OBSERVATION_CONCERNS_OBJECT: observationConcernsObject,
  DRIFT_ASSESSMENT_AGAINST_BASELINE: driftAssessmentAgainstBaseline,
  DRIFT_ASSESSMENT_HAS_FINDING: driftAssessmentHasFinding,
  DRIFT_FINDING_CONCERNS_OBJECT: driftFindingConcernsObject,
  CERTIFICATION_PROGRAM_HAS_BASIS: certificationProgramHasBasis,
  CERTIFICATION_PROGRAM_HAS_REVIEW: certificationProgramHasReview,
  CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM: certificationBasisHasComplianceItem,
  COMPLIANCE_ITEM_LINKED_TO_OBJECT: complianceItemLinkedToObject,
  COMPLIANCE_ITEM_HAS_FINDING: complianceItemHasFinding,
  CERTIFICATION_FINDING_HAS_EVIDENCE: certificationFindingHasEvidence,
  CERTIFICATION_REVIEW_HAS_FINDING: certificationReviewHasFinding,
  CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT: certificationReviewFindingConcernsObject,
};
