import {
  edgeTypesFrom,
  edgeTypesInto,
  graphNodeKey,
  type GraphDirection,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodeRef,
  type GraphNodeType,
} from "@/domain";
import { prisma, type DbClient } from "@/lib/db";
import { EDGE_RESOLVERS, type AuditEdge, type RawEdge } from "./graph-edge-resolvers";

/**
 * Reads the engineering graph out of the relational schema.
 *
 * This repository owns no tables of its own. Every node and every edge is read
 * from the same rows the domain modules write, so there is nothing to keep in
 * sync and no second copy of any relationship to drift.
 *
 * Every method takes a `projectId` that has already been checked against the
 * caller's organization. This layer enforces the project boundary; the service
 * above it enforces the organization boundary.
 */

/** How to load nodes of one type: the table, and which columns name it. */
interface NodeLoader {
  load(projectId: string, ids: string[], client: DbClient): Promise<GraphNode[]>;
}

function loader(load: NodeLoader["load"]): NodeLoader {
  return { load };
}

/**
 * One loader per node type.
 *
 * Each names the columns that make up a node's label explicitly, because
 * "the title field" is not the same column in every table — a design item has
 * a `name`, an assumption has only its `statement`.
 */
const NODE_LOADERS: Readonly<Record<GraphNodeType, NodeLoader>> = {
  PROJECT: loader(async (projectId, ids, client) => {
    // A project is a node in its own graph, and only its own.
    const rows = await client.project.findMany({
      where: { id: { in: ids.filter((id) => id === projectId) } },
      select: { id: true, name: true },
    });
    return rows.map((row) => ({
      type: "PROJECT" as const,
      id: row.id,
      projectId: row.id,
      identifier: null,
      label: row.name,
    }));
  }),
  STAKEHOLDER_NEED: loader(async (projectId, ids, client) => {
    const rows = await client.stakeholderNeed.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "STAKEHOLDER_NEED" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  REQUIREMENT: loader(async (projectId, ids, client) => {
    const rows = await client.requirement.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "REQUIREMENT" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  ENGINEERING_DECISION: loader(async (projectId, ids, client) => {
    const rows = await client.engineeringDecision.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "ENGINEERING_DECISION" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  DECISION_ALTERNATIVE: loader(async (projectId, ids, client) => {
    // Decision memory children carry no projectId of their own, so the project
    // is enforced through the parent decision.
    const rows = await client.decisionAlternative.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: { id: true, title: true },
    });
    return rows.map((row) => ({
      type: "DECISION_ALTERNATIVE" as const,
      id: row.id,
      projectId,
      identifier: null,
      label: row.title,
    }));
  }),
  DECISION_ASSUMPTION: loader(async (projectId, ids, client) => {
    const rows = await client.decisionAssumption.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: { id: true, statement: true },
    });
    return rows.map((row) => ({
      type: "DECISION_ASSUMPTION" as const,
      id: row.id,
      projectId,
      identifier: null,
      label: row.statement,
    }));
  }),
  DECISION_EXPECTATION: loader(async (projectId, ids, client) => {
    const rows = await client.decisionExpectation.findMany({
      where: { id: { in: ids }, engineeringDecision: { projectId } },
      select: { id: true, statement: true },
    });
    return rows.map((row) => ({
      type: "DECISION_EXPECTATION" as const,
      id: row.id,
      projectId,
      identifier: null,
      label: row.statement,
    }));
  }),
  DESIGN_ITEM: loader(async (projectId, ids, client) => {
    const rows = await client.designItem.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "DESIGN_ITEM" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  INTERFACE_DEFINITION: loader(async (projectId, ids, client) => {
    const rows = await client.interfaceDefinition.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "INTERFACE_DEFINITION" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  VERIFICATION_ACTIVITY: loader(async (projectId, ids, client) => {
    const rows = await client.verificationActivity.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "VERIFICATION_ACTIVITY" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  RISK: loader(async (projectId, ids, client) => {
    const rows = await client.risk.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "RISK" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  ISSUE: loader(async (projectId, ids, client) => {
    const rows = await client.issue.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "ISSUE" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  CHANGE_REQUEST: loader(async (projectId, ids, client) => {
    const rows = await client.changeRequest.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "CHANGE_REQUEST" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  EVIDENCE: loader(async (projectId, ids, client) => {
    const rows = await client.evidence.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, title: true },
    });
    return rows.map((row) => ({
      type: "EVIDENCE" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: null,
      label: row.title,
    }));
  }),
  APPROVAL: loader(async (projectId, ids, client) => {
    const rows = await client.approval.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, decision: true },
    });
    return rows.map((row) => ({
      type: "APPROVAL" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: null,
      // An approval has no title of its own; its verdict is what identifies it.
      label: row.decision,
    }));
  }),
  SUPPLIER: loader(async (projectId, ids, client) => {
    const rows = await client.supplier.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "SUPPLIER" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  SUPPLIED_ITEM: loader(async (projectId, ids, client) => {
    const rows = await client.suppliedItem.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "SUPPLIED_ITEM" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  SUPPLIER_QUALIFICATION: loader(async (projectId, ids, client) => {
    const rows = await client.supplierQualification.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, title: true },
    });
    return rows.map((row) => ({
      type: "SUPPLIER_QUALIFICATION" as const,
      id: row.id,
      projectId: row.projectId,
      // A qualification carries no project-scoped identifier: it is identified
      // by what it qualifies and for what purpose, not by a code of its own.
      identifier: null,
      label: row.title,
    }));
  }),
  ENGINEERING_BASELINE: loader(async (projectId, ids, client) => {
    const rows = await client.engineeringBaseline.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "ENGINEERING_BASELINE" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  BASELINE_MEMBER: loader(async (projectId, ids, client) => {
    // A member carries no projectId of its own; the project is enforced
    // through its baseline, exactly as decision-memory children are enforced
    // through their decision.
    const rows = await client.engineeringBaselineMember.findMany({
      where: { id: { in: ids }, baseline: { projectId } },
      select: { id: true, identifierSnapshot: true, labelSnapshot: true },
    });
    return rows.map((row) => ({
      type: "BASELINE_MEMBER" as const,
      id: row.id,
      projectId,
      // The snapshot, not the object's current identifier: a historical
      // baseline must keep naming what it actually baselined.
      identifier: row.identifierSnapshot,
      label: row.labelSnapshot,
    }));
  }),
  OPERATIONAL_OBSERVATION: loader(async (projectId, ids, client) => {
    const rows = await client.operationalObservation.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "OPERATIONAL_OBSERVATION" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  DRIFT_ASSESSMENT: loader(async (projectId, ids, client) => {
    const rows = await client.driftAssessment.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, status: true, evaluatedAt: true },
    });
    return rows.map((row) => ({
      type: "DRIFT_ASSESSMENT" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: null,
      // An assessment has no title; its verdict and moment identify it.
      label: `${row.status} · ${row.evaluatedAt.toISOString()}`,
    }));
  }),
  DRIFT_FINDING: loader(async (projectId, ids, client) => {
    const rows = await client.driftFinding.findMany({
      where: { id: { in: ids }, assessment: { projectId } },
      select: { id: true, ruleId: true, explanation: true },
    });
    return rows.map((row) => ({
      type: "DRIFT_FINDING" as const,
      id: row.id,
      projectId,
      identifier: row.ruleId,
      label: row.explanation,
    }));
  }),
  CERTIFICATION_PROGRAM: loader(async (projectId, ids, client) => {
    const rows = await client.certificationProgram.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, projectId: true, identifier: true, name: true },
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_PROGRAM" as const,
      id: row.id,
      projectId: row.projectId,
      identifier: row.identifier,
      label: row.name,
    }));
  }),
  CERTIFICATION_BASIS: loader(async (projectId, ids, client) => {
    const rows = await client.certificationBasis.findMany({
      where: { id: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_BASIS" as const,
      id: row.id,
      projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  COMPLIANCE_ITEM: loader(async (projectId, ids, client) => {
    const rows = await client.complianceItem.findMany({
      where: { id: { in: ids }, certificationBasis: { certificationProgram: { projectId } } },
      select: { id: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "COMPLIANCE_ITEM" as const,
      id: row.id,
      projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  CERTIFICATION_FINDING: loader(async (projectId, ids, client) => {
    const rows = await client.certificationFinding.findMany({
      where: {
        id: { in: ids },
        complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
      },
      select: { id: true, identifier: true, title: true },
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_FINDING" as const,
      id: row.id,
      projectId,
      identifier: row.identifier,
      label: row.title,
    }));
  }),
  CERTIFICATION_REVIEW: loader(async (projectId, ids, client) => {
    const rows = await client.certificationReview.findMany({
      where: { id: { in: ids }, certificationProgram: { projectId } },
      select: { id: true, status: true, evaluatedAt: true },
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW" as const,
      id: row.id,
      projectId,
      identifier: null,
      // A review has no title; its verdict and moment identify it, exactly
      // like a drift assessment.
      label: `${row.status} · ${row.evaluatedAt.toISOString()}`,
    }));
  }),
  CERTIFICATION_REVIEW_FINDING: loader(async (projectId, ids, client) => {
    const rows = await client.certificationReviewFinding.findMany({
      where: { id: { in: ids }, review: { certificationProgram: { projectId } } },
      select: { id: true, ruleId: true, message: true },
    });
    return rows.map((row) => ({
      type: "CERTIFICATION_REVIEW_FINDING" as const,
      id: row.id,
      projectId,
      identifier: row.ruleId,
      label: row.message,
    }));
  }),
};

interface RevisionRow {
  id: string;
  revision: Date;
}

type RevisionLoader = (
  projectId: string,
  ids: string[],
  client: DbClient,
) => Promise<RevisionRow[]>;

/**
 * One revision loader per node type.
 *
 * Every artifact carries `updatedAt` except an approval, which is immutable
 * once recorded -- its creation *is* its only revision. Decision memory children
 * reach the project through their parent decision, exactly as their node
 * loaders do.
 */
const REVISION_LOADERS: Readonly<Record<GraphNodeType, RevisionLoader>> = {
  PROJECT: async (projectId, ids, client) =>
    (
      await client.project.findMany({
        where: { id: { in: ids.filter((id) => id === projectId) } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  STAKEHOLDER_NEED: async (projectId, ids, client) =>
    (
      await client.stakeholderNeed.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  REQUIREMENT: async (projectId, ids, client) =>
    (
      await client.requirement.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  ENGINEERING_DECISION: async (projectId, ids, client) =>
    (
      await client.engineeringDecision.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  DECISION_ALTERNATIVE: async (projectId, ids, client) =>
    (
      await client.decisionAlternative.findMany({
        where: { id: { in: ids }, engineeringDecision: { projectId } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  DECISION_ASSUMPTION: async (projectId, ids, client) =>
    (
      await client.decisionAssumption.findMany({
        where: { id: { in: ids }, engineeringDecision: { projectId } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  DECISION_EXPECTATION: async (projectId, ids, client) =>
    (
      await client.decisionExpectation.findMany({
        where: { id: { in: ids }, engineeringDecision: { projectId } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  DESIGN_ITEM: async (projectId, ids, client) =>
    (
      await client.designItem.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  INTERFACE_DEFINITION: async (projectId, ids, client) =>
    (
      await client.interfaceDefinition.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  VERIFICATION_ACTIVITY: async (projectId, ids, client) =>
    (
      await client.verificationActivity.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  RISK: async (projectId, ids, client) =>
    (
      await client.risk.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  ISSUE: async (projectId, ids, client) =>
    (
      await client.issue.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  CHANGE_REQUEST: async (projectId, ids, client) =>
    (
      await client.changeRequest.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  EVIDENCE: async (projectId, ids, client) =>
    (
      await client.evidence.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  APPROVAL: async (projectId, ids, client) =>
    (
      await client.approval.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
  SUPPLIER: async (projectId, ids, client) =>
    (
      await client.supplier.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  SUPPLIED_ITEM: async (projectId, ids, client) =>
    (
      await client.suppliedItem.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  SUPPLIER_QUALIFICATION: async (projectId, ids, client) =>
    (
      await client.supplierQualification.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  ENGINEERING_BASELINE: async (projectId, ids, client) =>
    (
      await client.engineeringBaseline.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  // A baseline member, a drift assessment and a drift finding are all immutable
  // once written, so creation *is* their only revision — the same rule an
  // approval follows.
  BASELINE_MEMBER: async (projectId, ids, client) =>
    (
      await client.engineeringBaselineMember.findMany({
        where: { id: { in: ids }, baseline: { projectId } },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
  OPERATIONAL_OBSERVATION: async (projectId, ids, client) =>
    (
      await client.operationalObservation.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  DRIFT_ASSESSMENT: async (projectId, ids, client) =>
    (
      await client.driftAssessment.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
  DRIFT_FINDING: async (projectId, ids, client) =>
    (
      await client.driftFinding.findMany({
        where: { id: { in: ids }, assessment: { projectId } },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
  CERTIFICATION_PROGRAM: async (projectId, ids, client) =>
    (
      await client.certificationProgram.findMany({
        where: { id: { in: ids }, projectId },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  CERTIFICATION_BASIS: async (projectId, ids, client) =>
    (
      await client.certificationBasis.findMany({
        where: { id: { in: ids }, certificationProgram: { projectId } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  COMPLIANCE_ITEM: async (projectId, ids, client) =>
    (
      await client.complianceItem.findMany({
        where: { id: { in: ids }, certificationBasis: { certificationProgram: { projectId } } },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  CERTIFICATION_FINDING: async (projectId, ids, client) =>
    (
      await client.certificationFinding.findMany({
        where: {
          id: { in: ids },
          complianceItem: { certificationBasis: { certificationProgram: { projectId } } },
        },
        select: { id: true, updatedAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.updatedAt })),
  // A review and a review finding are both immutable once written, exactly
  // like a drift assessment/finding — creation *is* their only revision.
  CERTIFICATION_REVIEW: async (projectId, ids, client) =>
    (
      await client.certificationReview.findMany({
        where: { id: { in: ids }, certificationProgram: { projectId } },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
  CERTIFICATION_REVIEW_FINDING: async (projectId, ids, client) =>
    (
      await client.certificationReviewFinding.findMany({
        where: { id: { in: ids }, review: { certificationProgram: { projectId } } },
        select: { id: true, createdAt: true },
      })
    ).map((row) => ({ id: row.id, revision: row.createdAt })),
};

/** Which edge types could originate at any of these node types. */
function outgoingEdgeTypesFor(refs: readonly GraphNodeRef[]): GraphEdgeType[] {
  const types = new Set<GraphEdgeType>();
  for (const ref of refs) {
    for (const edgeType of edgeTypesFrom(ref.type)) types.add(edgeType);
  }
  return [...types];
}

/** Which edge types could point at any of these node types. */
function incomingEdgeTypesFor(refs: readonly GraphNodeRef[]): GraphEdgeType[] {
  const types = new Set<GraphEdgeType>();
  for (const ref of refs) {
    for (const edgeType of edgeTypesInto(ref.type)) types.add(edgeType);
  }
  return [...types];
}

/** Deterministic ordering, so identical inputs always produce identical output. */
function compareRawEdges(a: RawEdge, b: RawEdge): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.relationshipId === b.relationshipId) return 0;
  return a.relationshipId < b.relationshipId ? -1 : 1;
}

/**
 * What the graph service needs in order to read a graph.
 *
 * Named as an interface so the traversal algorithm can be tested against a
 * hand-built graph without a database, and without faking Prisma's query
 * semantics — the resolvers underneath are exercised for real against
 * PostgreSQL in the integration suite instead.
 */
export interface GraphReader {
  getNode(projectId: string, ref: GraphNodeRef): Promise<GraphNode | null>;
  resolveNodes(projectId: string, refs: readonly GraphNodeRef[]): Promise<Map<string, GraphNode>>;
  getOutgoingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]>;
  getIncomingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]>;
  getEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]>;
  materializeEdges(
    projectId: string,
    raw: readonly RawEdge[],
  ): Promise<{ edges: GraphEdge[]; nodes: Map<string, GraphNode> }>;
  getNeighbors(
    projectId: string,
    ref: GraphNodeRef,
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]>;
  auditEdges(
    projectId: string,
    edgeTypes: readonly GraphEdgeType[],
  ): Promise<Map<GraphEdgeType, AuditEdge[]>>;
  findExistingRefs(projectId: string, refs: readonly GraphNodeRef[]): Promise<Set<string>>;
  getNodeRevisions(projectId: string, refs: readonly GraphNodeRef[]): Promise<Map<string, Date>>;
}

export class EngineeringGraphRepository implements GraphReader {
  constructor(private readonly client: DbClient = prisma) {}

  /** Resolves one node, or null when it does not exist in this project. */
  async getNode(projectId: string, ref: GraphNodeRef): Promise<GraphNode | null> {
    const resolved = await this.resolveNodes(projectId, [ref]);
    return resolved.get(graphNodeKey(ref)) ?? null;
  }

  /**
   * Resolves many node references at once, keyed by `graphNodeKey`.
   *
   * References that do not resolve — a deleted row, or one belonging to another
   * project — are simply absent from the map. Callers treat absence as "not
   * part of this graph", which is what makes the traversal fail closed.
   */
  async resolveNodes(
    projectId: string,
    refs: readonly GraphNodeRef[],
  ): Promise<Map<string, GraphNode>> {
    const byType = new Map<GraphNodeType, string[]>();
    for (const ref of refs) {
      const ids = byType.get(ref.type);
      if (ids) ids.push(ref.id);
      else byType.set(ref.type, [ref.id]);
    }

    const batches = await Promise.all(
      [...byType.entries()].map(([type, ids]) =>
        NODE_LOADERS[type].load(projectId, [...new Set(ids)], this.client),
      ),
    );

    const resolved = new Map<string, GraphNode>();
    for (const batch of batches) {
      for (const node of batch) resolved.set(graphNodeKey(node), node);
    }
    return resolved;
  }

  /**
   * Edges where any of `refs` is the source.
   *
   * `edgeTypes`, when given, narrows the search further; the registry has
   * already narrowed it to the types these node types can actually have.
   */
  async getOutgoingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]> {
    if (refs.length === 0) return [];

    const candidates = filterEdgeTypes(outgoingEdgeTypesFor(refs), edgeTypes);
    const batches = await Promise.all(
      candidates.map((type) => EDGE_RESOLVERS[type].outgoing(projectId, refs, this.client)),
    );
    return batches.flat().sort(compareRawEdges);
  }

  /** Edges where any of `refs` is the target. */
  async getIncomingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]> {
    if (refs.length === 0) return [];

    const candidates = filterEdgeTypes(incomingEdgeTypesFor(refs), edgeTypes);
    const batches = await Promise.all(
      candidates.map((type) => EDGE_RESOLVERS[type].incoming(projectId, refs, this.client)),
    );
    return batches.flat().sort(compareRawEdges);
  }

  /** Edges in the requested direction, deduplicated by relationship. */
  async getEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<RawEdge[]> {
    if (direction === "OUTBOUND") return this.getOutgoingEdges(projectId, refs, edgeTypes);
    if (direction === "INBOUND") return this.getIncomingEdges(projectId, refs, edgeTypes);

    const [outgoing, incoming] = await Promise.all([
      this.getOutgoingEdges(projectId, refs, edgeTypes),
      this.getIncomingEdges(projectId, refs, edgeTypes),
    ]);

    // A self-referential edge type (requirement → requirement) can surface the
    // same row from both queries; the relationship id makes that easy to spot.
    const seen = new Set<string>();
    const merged: RawEdge[] = [];
    for (const edge of [...outgoing, ...incoming]) {
      const key = `${edge.type}:${edge.relationshipId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(edge);
    }
    return merged.sort(compareRawEdges);
  }

  /**
   * Resolves raw edges into full edges, dropping any whose endpoints cannot be
   * resolved inside this project.
   *
   * Returns the resolved nodes too, since the caller almost always needs them
   * and they have already been loaded.
   */
  async materializeEdges(
    projectId: string,
    raw: readonly RawEdge[],
  ): Promise<{ edges: GraphEdge[]; nodes: Map<string, GraphNode> }> {
    const refs = raw.flatMap((edge) => [edge.source, edge.target]);
    const nodes = await this.resolveNodes(projectId, refs);

    const edges: GraphEdge[] = [];
    for (const edge of raw) {
      const source = nodes.get(graphNodeKey(edge.source));
      const target = nodes.get(graphNodeKey(edge.target));
      // Fail closed: an endpoint we cannot see in this project is not an edge.
      if (!source || !target) continue;

      edges.push({
        type: edge.type,
        source,
        target,
        relationshipId: edge.relationshipId,
        createdAt: edge.createdAt,
        createdById: edge.createdById,
        note: edge.note,
        linkType: edge.linkType,
      });
    }
    return { edges, nodes };
  }

  /**
   * One hop from a single node, fully resolved.
   *
   * This is the direct-connections query; the traversal uses the batched
   * primitives above instead so it can resolve a whole frontier at a time.
   */
  async getNeighbors(
    projectId: string,
    ref: GraphNodeRef,
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphEdge[]> {
    const raw = await this.getEdges(projectId, [ref], direction, edgeTypes);
    const { edges } = await this.materializeEdges(projectId, raw);
    return edges;
  }

  /**
   * Every relationship row in the project, with the target's project left
   * visible so anomalies can be reported rather than silently filtered.
   */
  async auditEdges(
    projectId: string,
    edgeTypes: readonly GraphEdgeType[],
  ): Promise<Map<GraphEdgeType, AuditEdge[]>> {
    const results = await Promise.all(
      edgeTypes.map(async (type) => {
        const rows = await EDGE_RESOLVERS[type].audit(projectId, this.client);
        return [type, rows] as const;
      }),
    );
    return new Map(results);
  }

  /**
   * Which of these references actually exist in the project.
   *
   * Used by the consistency check to tell a missing endpoint from a
   * cross-project one without loading whole records.
   */
  /**
   * The revision stamp of each node, keyed by `graphNodeKey`.
   *
   * Separate from {@link resolveNodes} because it answers a different question:
   * not "what is this called?" but "when did it last move?". Assumption
   * monitoring needs the second without paying for the first.
   *
   * Batched one query per node type, and project-scoped like every other read,
   * so a node outside the project simply has no revision to report.
   */
  async getNodeRevisions(
    projectId: string,
    refs: readonly GraphNodeRef[],
  ): Promise<Map<string, Date>> {
    const byType = new Map<GraphNodeType, string[]>();
    for (const ref of refs) {
      const ids = byType.get(ref.type);
      if (ids) ids.push(ref.id);
      else byType.set(ref.type, [ref.id]);
    }

    const revisions = new Map<string, Date>();
    await Promise.all(
      [...byType.entries()].map(async ([type, ids]) => {
        const rows = await REVISION_LOADERS[type](projectId, [...new Set(ids)], this.client);
        for (const row of rows) {
          revisions.set(graphNodeKey({ type, id: row.id }), row.revision);
        }
      }),
    );
    return revisions;
  }

  async findExistingRefs(
    projectId: string,
    refs: readonly GraphNodeRef[],
  ): Promise<Set<string>> {
    const resolved = await this.resolveNodes(projectId, refs);
    return new Set(resolved.keys());
  }
}

function filterEdgeTypes(
  candidates: readonly GraphEdgeType[],
  requested: readonly GraphEdgeType[] | undefined,
): GraphEdgeType[] {
  if (!requested) return [...candidates];
  const allowed = new Set(requested);
  return candidates.filter((type) => allowed.has(type));
}

export const engineeringGraphRepository = new EngineeringGraphRepository();
