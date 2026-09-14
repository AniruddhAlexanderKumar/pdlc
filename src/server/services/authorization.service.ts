import {
  type ProjectRole,
  canApproveProjectAction,
  canManageProject,
  canReadProject,
  canWriteProject,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import * as membershipRepository from "@/server/repositories/project-membership.repository";
import * as projectRepository from "@/server/repositories/project.repository";
import * as userRepository from "@/server/repositories/user.repository";

/**
 * The one place project/organization access is decided.
 *
 * Every helper here does its own fresh lookup — it never trusts a role
 * carried on the request context, only `context.organizationId` and
 * `context.actorId`, which `requireAuthenticatedContext()` alone can set.
 * That is deliberate: `OrganizationContext` is the minimal shape roughly
 * thirty services already take, and keeping this service working from that
 * same minimal shape (rather than requiring every caller to carry a wider,
 * pre-resolved identity) means "does this project-scoped operation check
 * authorization" and "which project-scoped service is this" stay two
 * independent questions.
 *
 * **The two-axis model this implements**:
 *
 *   - An organization **OWNER** has full access to every project in their
 *     organization — no `ProjectMembership` row required. This is the
 *     access every existing project's creator already had before this
 *     capability existed, now checked rather than assumed.
 *   - Everyone else needs a real `ProjectMembership` row. Organization
 *     membership alone grants nothing — not even read access.
 *
 * Nothing here mutates. Membership writes live in
 * `project-membership.service.ts`, which calls straight into this file's
 * `requireProjectManage` before doing anything.
 */

/** True when this actor administers their own organization (full org access, no per-project row needed). */
export async function isOrganizationOwner(context: OrganizationContext): Promise<boolean> {
  if (!context.actorId) return false;
  const role = await userRepository.getOrganizationRole(context.actorId, context.organizationId);
  return role === "OWNER";
}

export async function requireOrganizationOwner(context: OrganizationContext): Promise<void> {
  if (!(await isOrganizationOwner(context))) {
    throw new ForbiddenError("Only an organization owner may perform this action.");
  }
}

/**
 * The caller's effective role on one project — their real membership row's
 * role, or the organization owner's implicit full access represented as
 * `MANAGER`, or `null` when they have neither. This is the single read
 * every other check in this file is built from.
 */
export async function getProjectRole(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectRole | null> {
  if (!context.actorId) return null;

  // Every project-scoped service call site currently reaches this only after
  // its own `requireProjectInOrganization` has already confirmed the project
  // belongs to `context.organizationId` — so this re-check is defense in
  // depth for those. It is not redundant for this function's *own*, directly
  // exported contract: called standalone (as `project.service.ts`'s own
  // wrapper and this file's tests both do), the organization-owner fallback
  // below has no other guard against a project belonging to a *different*
  // organization entirely. An owner of Org A is full-access only within Org
  // A, per this module's own doc comment — never elsewhere by virtue of
  // owning something.
  const project = await projectRepository.findProjectInOrganization(context.organizationId, projectId);
  if (!project) return null;

  const membership = await membershipRepository.findMembership(projectId, context.actorId);
  if (membership) return membership.role;

  return (await isOrganizationOwner(context)) ? "MANAGER" : null;
}

/**
 * The tenancy-plus-access guard. Throws the same `NotFoundError` (404) a
 * project outside the caller's organization already threw before this
 * capability existed — a project this caller cannot see is indistinguishable
 * from one that does not exist, preserving the codebase's existing
 * 404-vs-403 convention: 404 means "no access at all", 403 means
 * "I can see this, but not perform this specific action."
 */
export async function requireProjectAccess(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectRole> {
  const role = await getProjectRole(context, projectId);
  if (!role || !canReadProject(role)) {
    throw new NotFoundError(`Project ${projectId} was not found.`);
  }
  return role;
}

async function requireCapability(
  context: OrganizationContext,
  projectId: string,
  check: (role: ProjectRole) => boolean,
  message: string,
): Promise<ProjectRole> {
  const role = await requireProjectAccess(context, projectId);
  if (!check(role)) {
    throw new ForbiddenError(message);
  }
  return role;
}

/** Ordinary engineering content mutation: create/update/most transitions. MANAGER or ENGINEER. */
export async function requireProjectWrite(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectRole> {
  return requireCapability(
    context,
    projectId,
    canWriteProject,
    "Your role on this project does not allow editing engineering content.",
  );
}

/**
 * The specific review/approval actions the existing domain already treats
 * as a distinct authority — approving a requirement, approving a decision,
 * approving a change request, validating evidence, activating a baseline,
 * resolving a certification finding, resolving a Sentinel target. MANAGER
 * or REVIEWER.
 */
export async function requireProjectApprove(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectRole> {
  return requireCapability(
    context,
    projectId,
    canApproveProjectAction,
    "Your role on this project does not allow this review/approval action.",
  );
}

/** Project membership administration: add/remove members, change roles. MANAGER only. */
export async function requireProjectManage(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectRole> {
  return requireCapability(
    context,
    projectId,
    canManageProject,
    "Only a project manager (or the organization owner) may administer project membership.",
  );
}

/**
 * The check every owner-assignment call site (Requirement, Design Item,
 * Engineering Decision, Risk, Issue, Verification Activity) already
 * performed in its own, separately-duplicated form: an owner must be a
 * real member of the caller's organization — never an arbitrary id. This
 * consolidates those six near-identical copies into one, and adds the one
 * new rule Engineering Access Control requires: the proposed owner must
 * also be able to actually reach this project — an explicit member, or the
 * organization's owner — because assigning responsibility to someone who
 * cannot open the project would be a silent dead end.
 */
export async function requireAssignableOwner(
  context: OrganizationContext,
  scopedProjectId: string,
  ownerId: string,
): Promise<void> {
  if (!(await userRepository.isMemberOfOrganization(ownerId, context.organizationId))) {
    throw new ValidationError("That user is not a member of this organization.");
  }

  const ownerContext: OrganizationContext = { organizationId: context.organizationId, actorId: ownerId };
  const role = await getProjectRole(ownerContext, scopedProjectId);
  if (!role) {
    throw new ValidationError("That user does not have access to this project.");
  }
}

export { canApproveProjectAction, canManageProject, canReadProject, canWriteProject };
