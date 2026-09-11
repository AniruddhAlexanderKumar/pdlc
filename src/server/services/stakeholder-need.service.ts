import {
  type StakeholderNeed,
  createStakeholderNeedRequestSchema,
  entityIdSchema,
  stakeholderNeedStatusSchema,
  updateStakeholderNeedRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as needRepository from "@/server/repositories/stakeholder-need.repository";
import type { LinkedRequirementSummary } from "@/server/repositories/stakeholder-need.repository";
import { parseOrThrow } from "@/server/validation";
import { artifactAuditEvent, requireProjectInOrganization } from "./project-scope";

/**
 * Stakeholder need application service.
 *
 * Deliberately the smallest of the artifact services: a need is an
 * originating statement, not a governed record, so there is no lifecycle gate
 * and no ownership. What it does share with the rest is non-negotiable —
 * project scoping from the session, and an audit event committed with every
 * mutation.
 */

export const STAKEHOLDER_NEED_ENTITY_TYPE = "StakeholderNeed";

export const STAKEHOLDER_NEED_AUDIT_ACTIONS = {
  created: "stakeholder_need.created",
  updated: "stakeholder_need.updated",
} as const;

export interface StakeholderNeedDetail extends StakeholderNeed {
  /** Requirements that derive from this need, via the existing link table. */
  requirements: LinkedRequirementSummary[];
  history: AuditEventSummary[];
}

async function requireNeed(
  projectId: string,
  needId: unknown,
  client?: Parameters<typeof needRepository.findStakeholderNeedInProject>[2],
): Promise<StakeholderNeed> {
  const id = parseOrThrow(entityIdSchema, needId, "Invalid stakeholder need id");
  const need = await needRepository.findStakeholderNeedInProject(projectId, id, client);

  if (!need) {
    throw new NotFoundError(`Stakeholder need ${id} was not found.`);
  }
  return need;
}

export async function createStakeholderNeed(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<StakeholderNeed> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const data = parseOrThrow(createStakeholderNeedRequestSchema, input, "Invalid stakeholder need");

  return prisma.$transaction(async (tx) => {
    const need = await needRepository.createStakeholderNeed(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        stakeholder: data.stakeholder,
        status: data.status,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        STAKEHOLDER_NEED_AUDIT_ACTIONS.created,
        STAKEHOLDER_NEED_ENTITY_TYPE,
        need.id,
        { identifier: need.identifier, projectId: scopedProjectId },
      ),
      tx,
    );

    return need;
  });
}

export async function listStakeholderNeeds(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<StakeholderNeed[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(stakeholderNeedStatusSchema, filter.status, "Invalid status filter");

  return needRepository.listStakeholderNeedsInProject(scopedProjectId, status ? { status } : {});
}

export async function getStakeholderNeed(
  context: OrganizationContext,
  projectId: unknown,
  needId: unknown,
): Promise<StakeholderNeedDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const need = await requireNeed(scopedProjectId, needId);

  const [requirements, history] = await Promise.all([
    needRepository.listRequirementsForNeed(need.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: STAKEHOLDER_NEED_ENTITY_TYPE,
      entityId: need.id,
    }),
  ]);

  return { ...need, requirements, history };
}

export async function updateStakeholderNeed(
  context: OrganizationContext,
  projectId: unknown,
  needId: unknown,
  input: unknown,
): Promise<StakeholderNeed> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const data = parseOrThrow(
    updateStakeholderNeedRequestSchema,
    input,
    "Invalid stakeholder need update",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireNeed(scopedProjectId, needId, tx);

    const need = await needRepository.updateStakeholderNeed(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        STAKEHOLDER_NEED_AUDIT_ACTIONS.updated,
        STAKEHOLDER_NEED_ENTITY_TYPE,
        need.id,
        { changedFields: Object.keys(data) },
      ),
      tx,
    );

    return need;
  });
}
