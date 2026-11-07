import { entityIdSchema } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as projectRepository from "@/server/repositories/project.repository";
import { parseOrThrow } from "@/server/validation";
import * as authorizationService from "./authorization.service";

/**
 * The tenancy guard every project-scoped service operation starts with.
 *
 * One implementation on purpose: this is the check that stops an artifact in
 * another organization's project from being read or written, and four
 * near-identical copies of a security boundary is how one of them eventually
 * drifts. It is a guard, not a CRUD abstraction — services keep their own
 * explicit repositories and rules.
 *
 * **Deliberately unchanged by Engineering Access Control.** This function's
 * behavior and contract are exactly what they were before real project
 * membership existed — organization scoping only — so the large majority of
 * existing service call sites, and their unit tests' existing repository
 * mocks, keep working without modification. Real project-membership
 * enforcement is the four functions below, each a strict superset of this
 * one: they call this first, then layer a real capability check on top.
 * Services that need that stricter behavior opt in by calling one of them
 * instead; see [Engineering Access Control](../../../ARCHITECTURE.md) for
 * which call sites currently do.
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

/**
 * Organization scoping, plus the real project-access check: the caller must
 * be an explicit project member or their organization's owner.
 * `authorizationService.requireProjectAccess` throws the same
 * `NotFoundError` a project outside the organization already throws, so
 * "cannot see this project" reads identically whether the reason is
 * tenancy or membership.
 */
export async function requireProjectReadAccess(
  context: OrganizationContext,
  projectId: unknown,
): Promise<string> {
  const id = await requireProjectInOrganization(context, projectId);
  await authorizationService.requireProjectAccess(context, id);
  return id;
}

/** Organization scoping, project access, and MANAGER-or-ENGINEER write capability. */
export async function requireProjectWriteAccess(
  context: OrganizationContext,
  projectId: unknown,
): Promise<string> {
  const id = await requireProjectInOrganization(context, projectId);
  await authorizationService.requireProjectWrite(context, id);
  return id;
}

/** Organization scoping, project access, and MANAGER-or-REVIEWER approval capability. */
export async function requireProjectApproveAccess(
  context: OrganizationContext,
  projectId: unknown,
): Promise<string> {
  const id = await requireProjectInOrganization(context, projectId);
  await authorizationService.requireProjectApprove(context, id);
  return id;
}

/** Organization scoping, project access, and MANAGER-only membership-administration capability. */
export async function requireProjectManageAccess(
  context: OrganizationContext,
  projectId: unknown,
): Promise<string> {
  const id = await requireProjectInOrganization(context, projectId);
  await authorizationService.requireProjectManage(context, id);
  return id;
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
