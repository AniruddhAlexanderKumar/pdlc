import type { CertificationProgram, CertificationProgramStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { assertGuardedTransition } from "./prisma-error";

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

/**
 * The write behind an update that also changes `status`. Guarded, unlike
 * {@link updateProgram}: the write only applies if the row is still in
 * `fromStatus`, so a concurrent status change cannot silently overwrite, or
 * be silently overwritten by, another one racing it. A plain edit (no
 * status field in the request) still goes through {@link updateProgram}
 * unguarded — there is no lifecycle decision there to protect.
 * See `assertGuardedTransition`.
 */
export async function updateProgramGuarded(
  id: string,
  fromStatus: CertificationProgramStatus,
  data: UpdateCertificationProgramData,
  client: DbClient = prisma,
): Promise<CertificationProgram> {
  const result = await client.certificationProgram.updateMany({
    where: { id, status: fromStatus },
    data,
  });
  assertGuardedTransition(
    result.count,
    "This certification program's status was changed by someone else first. Reload and try again.",
  );
  return client.certificationProgram.findUniqueOrThrow({ where: { id } });
}
