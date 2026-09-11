import type {
  BaselineMemberType,
  ComparisonOperator,
  EngineeringBaselineMember,
} from "@/domain";
import { objectFingerprint } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Baseline membership, and the snapshots that make drift detectable.
 *
 * The two halves of this file do different jobs. The first stores and reads
 * membership rows. The second — {@link loadBaselineableObject} — is the one that
 * matters: it reads an engineering object's *current* state and reduces it to a
 * deterministic fingerprint, and it is used both when a member is added (to
 * capture what was baselined) and at evaluation time (to compute what the object
 * looks like now). Using the same function for both is what makes the comparison
 * meaningful; two different reductions would silently report drift that was only
 * ever a difference in how the state was hashed.
 */

export interface CreateMemberData {
  baselineId: string;
  nodeType: BaselineMemberType;
  nodeId: string;
  identifierSnapshot: string | null;
  labelSnapshot: string;
  stateSnapshot: string | null;
  fingerprint: string;
  revisionSnapshot: Date;
}

export async function createMember(
  data: CreateMemberData,
  client: DbClient = prisma,
): Promise<EngineeringBaselineMember> {
  try {
    return await client.engineeringBaselineMember.create({ data });
  } catch (error) {
    rethrowAsConflict(error, "That object is already part of this baseline.");
  }
}

export async function listMembers(
  baselineId: string,
  client: DbClient = prisma,
): Promise<EngineeringBaselineMember[]> {
  return client.engineeringBaselineMember.findMany({
    where: { baselineId },
    // Deterministic: by type, then by the identifier a reader would look for.
    orderBy: [{ nodeType: "asc" }, { identifierSnapshot: "asc" }, { id: "asc" }],
  });
}

/**
 * One member, reached through its baseline.
 *
 * The baseline id is part of the lookup on purpose: without it, a member id
 * guessed from another baseline could be removed by a caller who only has
 * access to this one.
 */
export async function findMemberInBaseline(
  baselineId: string,
  memberId: string,
  client: DbClient = prisma,
): Promise<EngineeringBaselineMember | null> {
  return client.engineeringBaselineMember.findFirst({
    where: { id: memberId, baselineId },
  });
}

export async function deleteMember(
  memberId: string,
  client: DbClient = prisma,
): Promise<void> {
  await client.engineeringBaselineMember.delete({ where: { id: memberId } });
}

// --- Reading baselineable objects -------------------------------------------

/**
 * An engineering object reduced to what a baseline cares about.
 *
 * `fingerprint` covers the substantive engineering state — identity, lifecycle,
 * the fields whose change constitutes drift. The object's own `updatedAt` is
 * carried separately and is deliberately **not** part of the fingerprint: a save
 * that changes nothing substantive must not register as drift, because a false
 * positive here costs an engineer a real investigation.
 */
export interface BaselineableObject {
  nodeType: BaselineMemberType;
  nodeId: string;
  identifier: string | null;
  label: string;
  /** The lifecycle value, where the type has one. Compared directly by some rules. */
  state: string | null;
  fingerprint: string;
  revision: Date;
  /**
   * The comparison terms, for a `DECISION_EXPECTATION` and nothing else.
   *
   * Carried on the object rather than fetched again at comparison time so the
   * terms a rule compares against are provably the same read the fingerprint
   * was computed from. Null for every other node type.
   */
  comparisonTerms: {
    operator: ComparisonOperator | null;
    expectedValue: string | null;
    unit: string | null;
  } | null;
}

/**
 * Loads the current state of baselineable objects, batched by type.
 *
 * One query per type present in the request, never one per object. Every query
 * is constrained to the project, so an id belonging to another project resolves
 * to nothing rather than to somebody else's artifact — which is the check that
 * stops a baseline from reaching across a tenancy boundary.
 *
 * Returns a map keyed `TYPE:id`. An object that is absent from the map does not
 * exist in this project; callers must treat that as unresolvable rather than as
 * evidence of deletion.
 */
export async function loadBaselineableObjects(
  projectId: string,
  refs: readonly { nodeType: BaselineMemberType; nodeId: string }[],
  client: DbClient = prisma,
): Promise<Map<string, BaselineableObject>> {
  const idsOf = (type: BaselineMemberType): string[] => [
    ...new Set(refs.filter((ref) => ref.nodeType === type).map((ref) => ref.nodeId)),
  ];

  const resolved = new Map<string, BaselineableObject>();
  const put = (object: BaselineableObject) => {
    resolved.set(`${object.nodeType}:${object.nodeId}`, object);
  };

  const requirementIds = idsOf("REQUIREMENT");
  const designIds = idsOf("DESIGN_ITEM");
  const decisionIds = idsOf("ENGINEERING_DECISION");
  const expectationIds = idsOf("DECISION_EXPECTATION");
  const verificationIds = idsOf("VERIFICATION_ACTIVITY");
  const suppliedItemIds = idsOf("SUPPLIED_ITEM");
  const qualificationIds = idsOf("SUPPLIER_QUALIFICATION");

  const [requirements, designItems, decisions, expectations, activities, items, qualifications] =
    await Promise.all([
      requirementIds.length
        ? client.requirement.findMany({
            where: { id: { in: requirementIds }, projectId },
            select: {
              id: true,
              identifier: true,
              title: true,
              statement: true,
              rationale: true,
              status: true,
              priority: true,
              updatedAt: true,
            },
          })
        : [],
      designIds.length
        ? client.designItem.findMany({
            where: { id: { in: designIds }, projectId },
            select: {
              id: true,
              identifier: true,
              name: true,
              description: true,
              itemType: true,
              status: true,
              updatedAt: true,
            },
          })
        : [],
      decisionIds.length
        ? client.engineeringDecision.findMany({
            where: { id: { in: decisionIds }, projectId },
            select: {
              id: true,
              identifier: true,
              title: true,
              statement: true,
              rationale: true,
              status: true,
              updatedAt: true,
            },
          })
        : [],
      expectationIds.length
        ? client.decisionExpectation.findMany({
            where: { id: { in: expectationIds }, engineeringDecision: { projectId } },
            select: {
              id: true,
              statement: true,
              measure: true,
              expectedValue: true,
              unit: true,
              comparisonOperator: true,
              status: true,
              updatedAt: true,
            },
          })
        : [],
      verificationIds.length
        ? client.verificationActivity.findMany({
            where: { id: { in: verificationIds }, projectId },
            select: {
              id: true,
              identifier: true,
              title: true,
              description: true,
              method: true,
              status: true,
              updatedAt: true,
            },
          })
        : [],
      suppliedItemIds.length
        ? client.suppliedItem.findMany({
            where: { id: { in: suppliedItemIds }, projectId },
            select: {
              id: true,
              identifier: true,
              name: true,
              description: true,
              itemType: true,
              status: true,
              supplierId: true,
              updatedAt: true,
            },
          })
        : [],
      qualificationIds.length
        ? client.supplierQualification.findMany({
            where: { id: { in: qualificationIds }, projectId },
            select: {
              id: true,
              title: true,
              qualificationType: true,
              status: true,
              evidenceReference: true,
              effectiveDate: true,
              expiryDate: true,
              supplierId: true,
              suppliedItemId: true,
              updatedAt: true,
            },
          })
        : [],
    ]);

  for (const row of requirements) {
    put({
      nodeType: "REQUIREMENT",
      nodeId: row.id,
      identifier: row.identifier,
      label: row.title,
      state: row.status,
      fingerprint: objectFingerprint({
        identifier: row.identifier,
        title: row.title,
        statement: row.statement,
        rationale: row.rationale,
        status: row.status,
        priority: row.priority,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  for (const row of designItems) {
    put({
      nodeType: "DESIGN_ITEM",
      nodeId: row.id,
      identifier: row.identifier,
      label: row.name,
      state: row.status,
      fingerprint: objectFingerprint({
        identifier: row.identifier,
        name: row.name,
        description: row.description,
        itemType: row.itemType,
        status: row.status,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  for (const row of decisions) {
    put({
      nodeType: "ENGINEERING_DECISION",
      nodeId: row.id,
      identifier: row.identifier,
      label: row.title,
      state: row.status,
      fingerprint: objectFingerprint({
        identifier: row.identifier,
        title: row.title,
        statement: row.statement,
        rationale: row.rationale,
        status: row.status,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  for (const row of expectations) {
    put({
      nodeType: "DECISION_EXPECTATION",
      nodeId: row.id,
      // An expectation has no project-scoped identifier of its own.
      identifier: null,
      label: row.statement,
      state: row.status,
      // The comparison terms are part of the basis: changing the operator or
      // the expected value changes what was approved, and that is drift.
      fingerprint: objectFingerprint({
        statement: row.statement,
        measure: row.measure,
        expectedValue: row.expectedValue,
        unit: row.unit,
        comparisonOperator: row.comparisonOperator,
        status: row.status,
      }),
      // The terms travel with the object, so a rule compares against provably
      // the same read the fingerprint was computed from.
      comparisonTerms: {
        operator: row.comparisonOperator,
        expectedValue: row.expectedValue,
        unit: row.unit,
      },
      revision: row.updatedAt,
    });
  }

  for (const row of activities) {
    put({
      nodeType: "VERIFICATION_ACTIVITY",
      nodeId: row.id,
      identifier: row.identifier,
      label: row.title,
      state: row.status,
      fingerprint: objectFingerprint({
        identifier: row.identifier,
        title: row.title,
        description: row.description,
        method: row.method,
        status: row.status,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  for (const row of items) {
    put({
      nodeType: "SUPPLIED_ITEM",
      nodeId: row.id,
      identifier: row.identifier,
      label: row.name,
      state: row.status,
      fingerprint: objectFingerprint({
        identifier: row.identifier,
        name: row.name,
        description: row.description,
        itemType: row.itemType,
        status: row.status,
        supplierId: row.supplierId,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  for (const row of qualifications) {
    put({
      nodeType: "SUPPLIER_QUALIFICATION",
      nodeId: row.id,
      identifier: null,
      label: row.title,
      state: row.status,
      fingerprint: objectFingerprint({
        title: row.title,
        qualificationType: row.qualificationType,
        status: row.status,
        evidenceReference: row.evidenceReference,
        effectiveDate: row.effectiveDate?.toISOString() ?? null,
        expiryDate: row.expiryDate?.toISOString() ?? null,
        supplierId: row.supplierId,
        suppliedItemId: row.suppliedItemId,
      }),
      comparisonTerms: null,
      revision: row.updatedAt,
    });
  }

  return resolved;
}
