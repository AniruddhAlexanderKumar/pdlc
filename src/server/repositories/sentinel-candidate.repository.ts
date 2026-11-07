import type { ChangeRequestStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Reads for Decision Sentinel's own detection sweep.
 *
 * This repository owns no tables of its own — the same relationship
 * `graph-repository.ts` has with the engineering graph. It exists because
 * Sentinel's content-change scan genuinely spans a dozen otherwise-unrelated
 * tables for one narrow purpose (a minimal `{id, identifier, label,
 * createdAt, updatedAt}` read, to notice a revision changed), and that
 * purpose belongs to Sentinel, not to each of those tables' own owning
 * repository. Every row still comes from the same tables each entity's own
 * repository writes; nothing here is a second copy of anything.
 */

export interface RevisionCandidateRow {
  id: string;
  identifier: string | null;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentChangeCandidateRows {
  requirements: RevisionCandidateRow[];
  designItems: RevisionCandidateRow[];
  decisions: RevisionCandidateRow[];
  assumptions: RevisionCandidateRow[];
  activities: RevisionCandidateRow[];
  suppliers: RevisionCandidateRow[];
  suppliedItems: RevisionCandidateRow[];
  qualifications: RevisionCandidateRow[];
  changes: RevisionCandidateRow[];
  bases: RevisionCandidateRow[];
  risks: RevisionCandidateRow[];
  issues: RevisionCandidateRow[];
  evidence: RevisionCandidateRow[];
}

/**
 * Every content-bearing object in the project, at a minimal projection —
 * one query per table, all thirteen run together, not one query per object.
 */
export async function findContentChangeCandidateRows(
  projectId: string,
  client: DbClient = prisma,
): Promise<ContentChangeCandidateRows> {
  const [
    requirements,
    designItems,
    decisions,
    assumptions,
    activities,
    suppliers,
    suppliedItems,
    qualifications,
    changes,
    bases,
    risks,
    issues,
    evidence,
  ] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.designItem.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
    }),
    client.engineeringDecision.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.decisionAssumption.findMany({
      where: { engineeringDecision: { projectId } },
      select: { id: true, statement: true, createdAt: true, updatedAt: true },
    }),
    client.verificationActivity.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.supplier.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
    }),
    client.suppliedItem.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
    }),
    client.supplierQualification.findMany({
      where: { projectId },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.changeRequest.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.certificationBasis.findMany({
      where: { certificationProgram: { projectId } },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.risk.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.issue.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
    client.evidence.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
    }),
  ]);

  const normalize = <T extends { id: string; createdAt: Date; updatedAt: Date }>(
    rows: T[],
    identifierOf: (row: T) => string | null,
    labelOf: (row: T) => string,
  ): RevisionCandidateRow[] =>
    rows.map((row) => ({
      id: row.id,
      identifier: identifierOf(row),
      label: labelOf(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

  return {
    requirements: normalize(
      requirements,
      (r) => r.identifier,
      (r) => r.title,
    ),
    designItems: normalize(
      designItems,
      (r) => r.identifier,
      (r) => r.name,
    ),
    decisions: normalize(
      decisions,
      (r) => r.identifier,
      (r) => r.title,
    ),
    assumptions: normalize(
      assumptions,
      () => null,
      (r) => r.statement,
    ),
    activities: normalize(
      activities,
      (r) => r.identifier,
      (r) => r.title,
    ),
    suppliers: normalize(
      suppliers,
      (r) => r.identifier,
      (r) => r.name,
    ),
    suppliedItems: normalize(
      suppliedItems,
      (r) => r.identifier,
      (r) => r.name,
    ),
    qualifications: normalize(
      qualifications,
      () => null,
      (r) => r.title,
    ),
    changes: normalize(
      changes,
      (r) => r.identifier,
      (r) => r.title,
    ),
    bases: normalize(
      bases,
      (r) => r.identifier,
      (r) => r.title,
    ),
    risks: normalize(
      risks,
      (r) => r.identifier,
      (r) => r.title,
    ),
    issues: normalize(
      issues,
      (r) => r.identifier,
      (r) => r.title,
    ),
    evidence: normalize(
      evidence,
      (r) => r.identifier,
      (r) => r.title,
    ),
  };
}

export interface ObservationCandidateRow {
  id: string;
  identifier: string | null;
  title: string;
  updatedAt: Date;
}

/** Every observation in the project — recording one is itself the surveillance-worthy act. */
export async function findObservationCandidateRows(
  projectId: string,
  client: DbClient = prisma,
): Promise<ObservationCandidateRow[]> {
  return client.operationalObservation.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, updatedAt: true },
  });
}

export interface RequirementOrDecisionMinimalRow {
  id: string;
  identifier: string | null;
  title: string;
}

/** The two source types {@link RELATIONSHIP_AUDIT_ACTIONS} in decision-sentinel.service.ts watches. */
export async function findRequirementAndDecisionMinimalRows(
  projectId: string,
  client: DbClient = prisma,
): Promise<{
  requirements: RequirementOrDecisionMinimalRow[];
  decisions: RequirementOrDecisionMinimalRow[];
}> {
  const [requirements, decisions] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
    }),
    client.engineeringDecision.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
    }),
  ]);
  return { requirements, decisions };
}

export interface MinimalIdentifiedRow {
  id: string;
  identifier: string | null;
  title: string;
}

export async function findMinimalVerificationActivities(
  projectId: string,
  client: DbClient = prisma,
): Promise<MinimalIdentifiedRow[]> {
  return client.verificationActivity.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
  });
}

/** Active change requests only — {@link ACTIVE_CHANGE_REQUEST_STATUSES} in domain/change-request.ts. */
export async function findMinimalActiveChangeRequests(
  projectId: string,
  activeStatuses: readonly ChangeRequestStatus[],
  client: DbClient = prisma,
): Promise<MinimalIdentifiedRow[]> {
  return client.changeRequest.findMany({
    where: { projectId, status: { in: [...activeStatuses] } },
    select: { id: true, identifier: true, title: true },
  });
}
