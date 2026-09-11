import type { CertificationProgram, CertificationProgramStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

export interface CreateCertificationProgramData {
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  ownerId: string | null;
}

export async function createProgram(
  data: CreateCertificationProgramData,
  client: DbClient = prisma,
): Promise<CertificationProgram> {
  return client.certificationProgram.create({ data });
}

/** At most one per project — the API surface is deliberately singular. */
export async function findProgramInProject(
  projectId: string,
  client: DbClient = prisma,
): Promise<CertificationProgram | null> {
  return client.certificationProgram.findUnique({ where: { projectId } });
}

export async function findProgramById(
  projectId: string,
  id: string,
  client: DbClient = prisma,
): Promise<CertificationProgram | null> {
  return client.certificationProgram.findFirst({ where: { id, projectId } });
}

export interface UpdateCertificationProgramData {
  name?: string;
  description?: string | null;
  status?: CertificationProgramStatus;
  ownerId?: string | null;
}

export async function updateProgram(
  id: string,
  data: UpdateCertificationProgramData,
  client: DbClient = prisma,
): Promise<CertificationProgram> {
  return client.certificationProgram.update({ where: { id }, data });
}
