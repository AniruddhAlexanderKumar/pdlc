import {
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
  createProjectRequestSchema,
  entityIdSchema,
  updateProjectRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as organizationRepository from "@/server/repositories/organization.repository";
import * as projectRepository from "@/server/repositories/project.repository";
import { parseOrThrow } from "@/server/validation";

/**
 * Project application service.
 *
 * Owns the rules that are neither pure domain shape nor persistence detail:
 * which fields a caller may set, what a state transition means, and which
 * mutations must leave an audit trail. Repositories stay responsible for
 * storage; route handlers stay responsible for HTTP.
 *
 * Two invariants hold throughout:
 *
 *  - **Tenancy.** Every operation takes an `OrganizationContext` and scopes
 *    its query by `organizationId`. A project in another organization reads
 *    as "not found", never as "forbidden" — the API does not confirm the
 *    existence of records the caller cannot see.
 *  - **Auditability.** A mutation and its audit event commit together or not
 *    at all.
 */

export const PROJECT_ENTITY_TYPE = "Project";

export const PROJECT_AUDIT_ACTIONS = {
  created: "project.created",
  updated: "project.updated",
  archived: "project.archived",
} as const;

/**
 * Request contracts are defined in the domain layer so the browser form and
 * this service validate against one definition. Re-exported here because the
 * service is the authority on what its operations accept.
 */
export {
  createProjectRequestSchema,
  updateProjectRequestSchema,
  type CreateProjectRequest,
  type UpdateProjectRequest,
};

export const projectIdSchema = entityIdSchema;

async function requireOrganization(organizationId: string): Promise<void> {
  if (!(await organizationRepository.organizationExists(organizationId))) {
    throw new NotFoundError(`Organization ${organizationId} was not found.`);
  }
}

/**
 * Loads a project within the caller's organization or throws.
 * `client` is threaded through so callers inside a transaction read the same
 * snapshot they are about to write.
 */
async function requireProjectInOrganization(
  context: OrganizationContext,
  projectId: string,
  client?: Parameters<typeof projectRepository.findProjectInOrganization>[2],
): Promise<Project> {
  const project = await projectRepository.findProjectInOrganization(
    context.organizationId,
    projectId,
    client,
  );

  if (!project) {
    throw new NotFoundError(`Project ${projectId} was not found.`);
  }
  return project;
}

export async function createProject(
  context: OrganizationContext,
  input: unknown,
): Promise<Project> {
  const data = parseOrThrow(createProjectRequestSchema, input, "Invalid project");
  await requireOrganization(context.organizationId);

  return prisma.$transaction(async (tx) => {
    const project = await projectRepository.createProject(
      {
        organizationId: context.organizationId,
        name: data.name,
        description: data.description ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId: context.actorId,
        action: PROJECT_AUDIT_ACTIONS.created,
        entityType: PROJECT_ENTITY_TYPE,
        entityId: project.id,
        metadata: { name: project.name },
      },
      tx,
    );

    return project;
  });
}

/** Projects in the caller's organization, newest first. */
export async function listProjects(context: OrganizationContext): Promise<Project[]> {
  return projectRepository.listProjectsByOrganization(context.organizationId);
}

export async function getProject(
  context: OrganizationContext,
  projectId: unknown,
): Promise<Project> {
  const id = parseOrThrow(projectIdSchema, projectId, "Invalid project id");
  return requireProjectInOrganization(context, id);
}

export async function updateProject(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<Project> {
  const id = parseOrThrow(projectIdSchema, projectId, "Invalid project id");
  const data = parseOrThrow(updateProjectRequestSchema, input, "Invalid project update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireProjectInOrganization(context, id, tx);

    // An archived project is a closed record, not an editable one. Without
    // this the API would happily let a caller keep working on something the
    // organization has already retired.
    if (existing.status === "ARCHIVED") {
      throw new ConflictError("This project is archived and can no longer be modified.");
    }

    const project = await projectRepository.updateProject(
      id,
      { name: data.name, description: data.description },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId: context.actorId,
        action: PROJECT_AUDIT_ACTIONS.updated,
        entityType: PROJECT_ENTITY_TYPE,
        entityId: project.id,
        metadata: { changedFields: Object.keys(data) },
      },
      tx,
    );

    return project;
  });
}

/** Archiving is a state transition, never a delete — the record is retained. */
export async function archiveProject(
  context: OrganizationContext,
  projectId: unknown,
): Promise<Project> {
  const id = parseOrThrow(projectIdSchema, projectId, "Invalid project id");

  return prisma.$transaction(async (tx) => {
    const existing = await requireProjectInOrganization(context, id, tx);

    if (existing.status === "ARCHIVED") {
      throw new ConflictError("This project is already archived.");
    }

    const project = await projectRepository.updateProject(id, { status: "ARCHIVED" }, tx);

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId: context.actorId,
        action: PROJECT_AUDIT_ACTIONS.archived,
        entityType: PROJECT_ENTITY_TYPE,
        entityId: project.id,
        metadata: { previousStatus: existing.status },
      },
      tx,
    );

    return project;
  });
}
