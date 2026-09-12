import type { VerificationActivity, VerificationMethod, VerificationStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import type { OwnerSummary } from "./design-item.repository";
import { toVerificationActivity } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";
import type { LinkedRequirementSummary } from "./stakeholder-need.repository";

/** Verification activity data access. Project-scoped throughout. */

export interface VerificationActivityWithOwner extends VerificationActivity {
  owner: OwnerSummary | null;
}

export interface CreateVerificationActivityData {
  projectId: string;
  identifier: string;
  title: string;
  description: string | null;
  method: VerificationMethod;
  plannedDate: Date | null;
  ownerId: string | null;
}

export async function createVerificationActivity(
  data: CreateVerificationActivityData,
  client: DbClient = prisma,
): Promise<VerificationActivity> {
  try {
    const row = await client.verificationActivity.create({ data });
    return toVerificationActivity(row);
  } catch (error) {
    rethrowAsConflict(
      error,
      `Verification activity ${data.identifier} already exists in this project.`,
    );
  }
}

export async function findVerificationActivityInProject(
  projectId: string,
  activityId: string,
  client: DbClient = prisma,
): Promise<VerificationActivity | null> {
  const row = await client.verificationActivity.findFirst({
    where: { id: activityId, projectId },
  });
  return row ? toVerificationActivity(row) : null;
}

export async function listVerificationActivitiesInProject(
  projectId: string,
  options: { status?: VerificationStatus } = {},
  client: DbClient = prisma,
): Promise<VerificationActivityWithOwner[]> {
  const rows = await client.verificationActivity.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toVerificationActivity(row), owner: row.owner }));
}

export async function findVerificationActivityOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<OwnerSummary | null> {
  return client.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });
}

export interface UpdateVerificationActivityData {
  title?: string | undefined;
  description?: string | null | undefined;
  method?: VerificationMethod | undefined;
  status?: VerificationStatus | undefined;
  plannedDate?: Date | null | undefined;
  completedDate?: Date | null | undefined;
  ownerId?: string | null | undefined;
}

export async function updateVerificationActivity(
  id: string,
  data: UpdateVerificationActivityData,
  client: DbClient = prisma,
): Promise<VerificationActivity> {
  const row = await client.verificationActivity.update({ where: { id }, data });
  return toVerificationActivity(row);
}

/**
 * Requirements verified by this activity, from the existing link table.
 *
 * Scoped by project as well as by activity. The link table's foreign keys do
 * not by themselves confine a link to one project, so a row pointing at another
 * programme's requirement — written by a partially applied migration, or by
 * hand — would otherwise surface that requirement's identifier, title and
 * status here. The link-creation path already refuses such a target; this makes
 * the read fail closed too, exactly as the graph does.
 *
 * A link that is filtered out is not silently benign: the readiness engine
 * reports it as an unresolvable traceability condition.
 */
export async function listRequirementsForVerification(
  projectId: string,
  verificationActivityId: string,
  client: DbClient = prisma,
): Promise<LinkedRequirementSummary[]> {
  const links = await client.requirementVerificationLink.findMany({
    where: { verificationActivityId, requirement: { projectId } },
    select: {
      requirement: { select: { id: true, identifier: true, title: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => link.requirement);
}

export interface LinkedEvidenceSummary {
  id: string;
  identifier: string;
  title: string;
  evidenceType: string;
  sourceReference: string;
  status: string;
}

/** Evidence already attached to this activity, most recently linked last. */
export async function listEvidenceForVerification(
  verificationActivityId: string,
  client: DbClient = prisma,
): Promise<LinkedEvidenceSummary[]> {
  const links = await client.evidenceLink.findMany({
    where: { verificationActivityId },
    select: {
      evidence: {
        select: {
          id: true,
          identifier: true,
          title: true,
          evidenceType: true,
          sourceReference: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => link.evidence);
}

/**
 * Attaches an *existing* evidence record — this is not a document store and
 * uploads nothing, exactly like the supplier-qualification evidence link it
 * mirrors.
 */
export async function linkVerificationEvidence(
  verificationActivityId: string,
  evidenceId: string,
  note: string | null,
  createdById: string | null,
  client: DbClient = prisma,
): Promise<string> {
  try {
    const row = await client.evidenceLink.create({
      data: { verificationActivityId, evidenceId, note, createdById },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    rethrowAsConflict(error, "That evidence is already attached to this verification activity.");
  }
}

export async function unlinkVerificationEvidence(
  verificationActivityId: string,
  evidenceId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const { count } = await client.evidenceLink.deleteMany({
    where: { verificationActivityId, evidenceId },
  });
  return count > 0;
}

export async function evidenceExistsInProject(
  evidenceId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  return (
    (await client.evidence.findFirst({
      where: { id: evidenceId, projectId },
      select: { id: true },
    })) !== null
  );
}
