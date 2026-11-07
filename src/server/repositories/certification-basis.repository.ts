import type { CertificationBasis, CertificationBasisStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

export interface CreateCertificationBasisData {
  certificationProgramId: string;
  identifier: string;
  title: string;
  description: string | null;
  revision: string;
  sourceReference: string | null;
  createdById: string | null;
}

export async function createBasis(
  data: CreateCertificationBasisData,
  client: DbClient = prisma,
): Promise<CertificationBasis> {
  return client.certificationBasis.create({ data });
}

export async function findBasisInProgram(
  certificationProgramId: string,
  id: string,
  client: DbClient = prisma,
): Promise<CertificationBasis | null> {
  return client.certificationBasis.findFirst({ where: { id, certificationProgramId } });
}

export async function listBasesInProgram(
  certificationProgramId: string,
  client: DbClient = prisma,
): Promise<CertificationBasis[]> {
  return client.certificationBasis.findMany({
    where: { certificationProgramId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function findActiveBasis(
  certificationProgramId: string,
  client: DbClient = prisma,
): Promise<CertificationBasis | null> {
  return client.certificationBasis.findFirst({
    where: { certificationProgramId, status: "ACTIVE" },
  });
}

export interface UpdateCertificationBasisData {
  title?: string;
  description?: string | null;
  revision?: string;
  sourceReference?: string | null;
}

export async function updateBasis(
  id: string,
  data: UpdateCertificationBasisData,
  client: DbClient = prisma,
): Promise<CertificationBasis> {
  return client.certificationBasis.update({ where: { id }, data });
}

/**
 * Fixes the basis as ACTIVE.
 *
 * Race-safe against a concurrent activation of a *different* basis in the
 * same program: `certification_bases_active_unique` (a partial unique index
 * — see the migration that adds it) allows at most one ACTIVE row per
 * program, so a losing concurrent transaction fails here with a unique-
 * constraint violation rather than silently leaving two bases ACTIVE.
 */
export async function activateBasis(
  id: string,
  activatedById: string | null,
  client: DbClient = prisma,
): Promise<CertificationBasis> {
  try {
    return await client.certificationBasis.update({
      where: { id },
      data: { status: "ACTIVE", activatedAt: new Date(), activatedById },
    });
  } catch (error) {
    rethrowAsConflict(
      error,
      "Another certification basis was activated for this program at the same moment. Reload and try again.",
    );
  }
}

export async function supersedeBasis(
  oldId: string,
  newId: string,
  client: DbClient = prisma,
): Promise<CertificationBasis> {
  return client.certificationBasis.update({
    where: { id: oldId },
    data: { status: "SUPERSEDED", supersededById: newId },
  });
}

export type { CertificationBasisStatus };
