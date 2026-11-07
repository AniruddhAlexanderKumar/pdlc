import type {
  CertificationFinding,
  CertificationFindingSeverity,
  CertificationFindingStatus,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { assertGuardedTransition } from "./prisma-error";

export interface CreateCertificationFindingData {
  complianceItemId: string;
  identifier: string;
  title: string;
  description: string | null;
  severity: CertificationFindingSeverity;
}

export async function createFinding(
  data: CreateCertificationFindingData,
  client: DbClient = prisma,
): Promise<CertificationFinding> {
  return client.certificationFinding.create({ data });
}

export async function findFindingInItem(
  complianceItemId: string,
  id: string,
  client: DbClient = prisma,
): Promise<CertificationFinding | null> {
  return client.certificationFinding.findFirst({ where: { id, complianceItemId } });
}

export async function listFindingsForItem(
  complianceItemId: string,
  client: DbClient = prisma,
): Promise<CertificationFinding[]> {
  return client.certificationFinding.findMany({
    where: { complianceItemId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export interface UpdateCertificationFindingData {
  title?: string;
  description?: string | null;
  severity?: CertificationFindingSeverity;
  status?: "OPEN" | "IN_PROGRESS";
}

export async function updateFinding(
  id: string,
  data: UpdateCertificationFindingData,
  client: DbClient = prisma,
): Promise<CertificationFinding> {
  return client.certificationFinding.update({ where: { id }, data });
}

/**
 * Guarded: applies only if the finding is still OPEN or IN_PROGRESS at write
 * time, so a concurrent disposition of the same finding cannot silently
 * overwrite — or be silently overwritten by — another one racing it. See
 * `assertGuardedTransition`.
 */
export async function dispositionFinding(
  id: string,
  status: "RESOLVED" | "ACCEPTED",
  note: string,
  evidenceId: string | null,
  resolvedById: string | null,
  client: DbClient = prisma,
): Promise<CertificationFinding> {
  const result = await client.certificationFinding.updateMany({
    where: { id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    data: {
      status,
      resolutionNote: note,
      evidenceId,
      resolvedById,
      resolvedAt: new Date(),
    },
  });
  assertGuardedTransition(
    result.count,
    "This certification finding was already dispositioned by someone else first. Reload and try again.",
  );
  return client.certificationFinding.findUniqueOrThrow({ where: { id } });
}

/** Open (OPEN/IN_PROGRESS) findings across a set of compliance items, one query for all of them. */
export async function listOpenFindingsForItems(
  complianceItemIds: readonly string[],
  client: DbClient = prisma,
): Promise<CertificationFinding[]> {
  if (complianceItemIds.length === 0) return [];
  return client.certificationFinding.findMany({
    where: {
      complianceItemId: { in: [...complianceItemIds] },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** Dispositioned (RESOLVED/ACCEPTED) findings, batched the same way, for review-basis context. */
export async function listDispositionedFindingsForItems(
  complianceItemIds: readonly string[],
  client: DbClient = prisma,
): Promise<CertificationFinding[]> {
  if (complianceItemIds.length === 0) return [];
  return client.certificationFinding.findMany({
    where: {
      complianceItemId: { in: [...complianceItemIds] },
      status: { in: ["RESOLVED", "ACCEPTED"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export type { CertificationFindingStatus };
