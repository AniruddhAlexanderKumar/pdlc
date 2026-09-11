import type { CertificationBasis, CertificationBasisStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

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

export async function activateBasis(
  id: string,
  activatedById: string | null,
  client: DbClient = prisma,
): Promise<CertificationBasis> {
  return client.certificationBasis.update({
    where: { id },
    data: { status: "ACTIVE", activatedAt: new Date(), activatedById },
  });
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
