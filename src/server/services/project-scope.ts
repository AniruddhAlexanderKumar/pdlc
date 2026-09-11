import { entityIdSchema } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as projectRepository from "@/server/repositories/project.repository";
import { parseOrThrow } from "@/server/validation";

/**
 * The tenancy guard every project-scoped service operation starts with.
 *
 * One implementation on purpose: this is the check that stops an artifact in
 * another organization's project from being read or written, and four
 * near-identical copies of a security boundary is how one of them eventually
 * drifts. It is a guard, not a CRUD abstraction — services keep their own
 * explicit repositories and rules.
 *
 * Returns the validated project id, so callers pass that on rather than the
 * unvalidated value they received.
 */
export async function requireProjectInOrganization(
  context: OrganizationContext,
  projectId: unknown,
): Promise<string> {
  const id = parseOrThrow(entityIdSchema, projectId, "Invalid project id");
  const project = await projectRepository.findProjectInOrganization(context.organizationId, id);

  if (!project) {
    // Not "forbidden": the API does not confirm that a project it will not
    // show you exists.
    throw new NotFoundError(`Project ${id} was not found.`);
  }
  return project.id;
}

/** Audit event skeleton shared by the artifact services. */
export function artifactAuditEvent(
  context: OrganizationContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType,
    entityId,
    metadata,
  };
}
