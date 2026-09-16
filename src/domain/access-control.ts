import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";
import { entityIdSchema } from "./shared/identifier";

/**
 * Organization and project authorization.
 *
 * Two independent axes, not one hierarchy:
 *
 * - **Organization role** (`OWNER` | `MEMBER`) — who administers the
 *   organization itself: its membership, and (by extension) every project
 *   in it.
 * - **Project role** (`MANAGER` | `ENGINEER` | `REVIEWER` | `VIEWER`) —
 *   what a specific person may do inside one specific project.
 *
 * An organization `OWNER` has full access to every project in their
 * organization without needing an explicit `ProjectMembership` row — the
 * same authority they had before this capability existed, now made
 * explicit and enforced rather than assumed. Everyone else needs a real
 * membership row; organization membership alone no longer implies project
 * access.
 *
 * This is Prisma-free, like every other domain file. Enforcement lives in
 * `src/server/services/authorization.service.ts`; this file only defines
 * the vocabulary and the pure capability predicates every enforcement
 * decision is built from.
 */

// --- Organization role -----------------------------------------------------

/**
 * `OWNER` — administers the organization: manages organization membership
 * (who belongs to it at all) and has full access to every project in it,
 * with no per-project membership row required. `EXECUTIVE` — see below.
 * `MEMBER` — an ordinary authenticated user of the organization; cannot
 * manage organization membership or grant roles to anyone, and reaches a
 * project only through an explicit `ProjectMembership`.
 *
 * This was two values for most of this product's life, with a comment
 * saying so deliberately: "not a permissions ladder with more tiers
 * waiting to be added", because the product had exactly one
 * organization-wide administrative question and `OWNER` answered it. That
 * reasoning still holds for *administration*, and `EXECUTIVE` does not
 * weaken it — an executive administers nothing at all. It exists because
 * a genuinely different organization-wide question turned up, which no
 * project role could answer: **who may see across every project without
 * being able to change anything in any of them.**
 *
 * `EXECUTIVE` is therefore not a rung between `OWNER` and `MEMBER`. It is
 * orthogonal to both: broader *reach* than a member (every project,
 * without a membership row), strictly narrower *authority* than either
 * (read-only everywhere, and no organization administration whatsoever —
 * it cannot add a person, change a role, or set industry or terminology).
 * Concretely it resolves to an implicit `VIEWER` on every project in the
 * organization; see `implicitProjectRole` below, which is the only place
 * that mapping is written down.
 */
export const ORGANIZATION_ROLES = ["OWNER", "EXECUTIVE", "MEMBER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/** Pure string check — "does this role value mean OWNER", for display/UI code. Never an access decision on its own; see `authorization.service.ts` for real enforcement. */
export function isOwnerRole(role: string): boolean {
  return role === "OWNER";
}

const ORGANIZATION_ROLE_LABELS: Readonly<Record<OrganizationRole, string>> = {
  OWNER: "Owner",
  EXECUTIVE: "Executive",
  MEMBER: "Member",
};

export function organizationRoleLabel(role: OrganizationRole): string {
  return ORGANIZATION_ROLE_LABELS[role];
}

const ORGANIZATION_ROLE_DESCRIPTIONS: Readonly<Record<OrganizationRole, string>> = {
  OWNER: "Administers the organization, and has full access to every project in it.",
  EXECUTIVE: "Reads every project in the organization, and the portfolio view. Changes nothing, anywhere.",
  MEMBER: "Reaches only the projects they have been explicitly added to.",
};

export function organizationRoleDescription(role: OrganizationRole): string {
  return ORGANIZATION_ROLE_DESCRIPTIONS[role];
}

/**
 * Organization administration: managing who belongs to the organization,
 * what anyone's organization role is, and the organization-wide settings
 * (industry, terminology). `OWNER` alone — an executive's reach is
 * deliberately read-only, so it grants nothing here.
 */
export function canAdministerOrganization(role: OrganizationRole | null): boolean {
  return role === "OWNER";
}

/**
 * The cross-project portfolio view. An owner sees it because they can
 * already reach everything anyway; an executive sees it because it is the
 * reason the role exists.
 *
 * Takes a plain `string`, like `isOwnerRole` above and for the same
 * reason: `AuthenticatedIdentity.organizationRole` is typed `string`
 * (`auth.ts` cannot import this module — it is the other way round), and
 * the page component needs this check too. Compared against the real
 * role constants rather than inline literals, so there is still one source
 * of truth. Server enforcement is `requirePortfolioAccess`, which resolves
 * the role from the database; this is the routing and display half.
 */
export function canViewPortfolio(role: string | null): boolean {
  return role === "OWNER" || role === "EXECUTIVE";
}

/**
 * The project role an organization role grants on *every* project in the
 * organization, with no `ProjectMembership` row — or `null` when it grants
 * none and a real membership row is the only way in.
 *
 * The single place this mapping is written down. `authorization.service.ts`
 * reads it for enforcement and nothing else re-derives it, so "what does
 * an executive actually get" has exactly one answer to change.
 */
export function implicitProjectRole(role: OrganizationRole | null): ProjectRole | null {
  if (role === "OWNER") return "MANAGER";
  if (role === "EXECUTIVE") return "VIEWER";
  return null;
}

// --- Project role ------------------------------------------------------------

/**
 * What a project role means, precisely — not a linear ladder:
 *
 * - **MANAGER** — every capability below, plus project membership
 *   administration (add/remove members, change roles) and lifecycle
 *   approvals where the domain allows them. The only role that can change
 *   who else has access to the project.
 * - **ENGINEER** — creates and edits engineering content: requirements,
 *   decisions, change requests, risks, issues, evidence, baselines,
 *   verification activities, and the rest of ordinary engineering work.
 *   Cannot administer project membership and cannot perform the specific
 *   approval-type actions reserved for review authority (see below).
 * - **REVIEWER** — reads everything, and may perform the specific
 *   review/approval actions the existing domain already defines as a
 *   distinct authority from ordinary content editing (approving a
 *   requirement, approving a decision, approving a change request,
 *   validating evidence, resolving a certification finding, resolving a
 *   Sentinel target, activating a baseline). Cannot create or edit
 *   ordinary engineering content, and cannot administer project
 *   membership.
 * - **VIEWER** — read-only. No mutation of any kind.
 *
 * `ENGINEER` and `REVIEWER` are deliberately not ordered against each
 * other: a reviewer is not "below" an engineer, and an engineer is not
 * "below" a reviewer — they hold two different, non-overlapping
 * authorities (write vs. approve) that this system's own domain already
 * treats as separate questions. `MANAGER` is the only role that is a
 * strict superset of both.
 */
export const PROJECT_ROLES = ["MANAGER", "ENGINEER", "REVIEWER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export const projectRoleSchema = z.enum(PROJECT_ROLES);

const PROJECT_ROLE_LABELS: Readonly<Record<ProjectRole, string>> = {
  MANAGER: "Manager",
  ENGINEER: "Engineer",
  REVIEWER: "Reviewer",
  VIEWER: "Viewer",
};

export function projectRoleLabel(role: ProjectRole): string {
  return PROJECT_ROLE_LABELS[role];
}

const PROJECT_ROLE_DESCRIPTIONS: Readonly<Record<ProjectRole, string>> = {
  MANAGER: "Full engineering access, project membership administration, and lifecycle approvals.",
  ENGINEER: "Creates and edits engineering content. Cannot administer membership or approve.",
  REVIEWER: "Reads everything and performs review/approval actions only. Cannot edit content.",
  VIEWER: "Read-only access.",
};

export function projectRoleDescription(role: ProjectRole): string {
  return PROJECT_ROLE_DESCRIPTIONS[role];
}

// --- Capability predicates ---------------------------------------------------
//
// The single source of truth for what each project role grants. Both the
// authorization service (server-side enforcement) and the frontend
// (convenience — hiding or disabling actions) read these same functions,
// so the two can never quietly disagree about what a role means. Server
// enforcement is authoritative regardless: see
// `src/server/services/authorization.service.ts`.

/** Every project role can read — the one universal capability. */
export function canReadProject(role: ProjectRole | null): boolean {
  return role !== null;
}

/** Ordinary engineering content mutation: create/update/most transitions. */
export function canWriteProject(role: ProjectRole | null): boolean {
  return role === "MANAGER" || role === "ENGINEER";
}

/** Project membership administration: add/remove members, change roles. */
export function canManageProject(role: ProjectRole | null): boolean {
  return role === "MANAGER";
}

/**
 * The specific review/approval actions the existing domain already treats
 * as a distinct authority from ordinary content editing — never "every
 * mutation", only the ones enumerated in
 * `authorization.service.ts`'s own call sites (approving a requirement,
 * approving a decision, approving a change request, validating evidence,
 * activating a baseline, resolving a certification finding, resolving a
 * Sentinel target).
 */
export function canApproveProjectAction(role: ProjectRole | null): boolean {
  return role === "MANAGER" || role === "REVIEWER";
}

// --- Request contracts --------------------------------------------------------

export const addProjectMemberRequestSchema = z.strictObject({
  userId: entityIdSchema,
  role: projectRoleSchema,
});
export type AddProjectMemberRequest = z.infer<typeof addProjectMemberRequestSchema>;

export const changeProjectMemberRoleRequestSchema = z.strictObject({
  role: projectRoleSchema,
});
export type ChangeProjectMemberRoleRequest = z.infer<typeof changeProjectMemberRoleRequestSchema>;

/**
 * An organization owner provisioning a new member's account directly —
 * this system's own minimum viable "add someone to my organization",
 * consistent with its self-hosted, no-third-party-identity-service
 * architecture: no invitation email, no external identity provider, just
 * the same password-based account creation `register()` already performs,
 * scoped into the owner's existing organization instead of a new one.
 */
export const addOrganizationMemberRequestSchema = z.strictObject({
  name: z.string().trim().min(1, "A name is required").max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type AddOrganizationMemberRequest = z.infer<typeof addOrganizationMemberRequestSchema>;

/**
 * The organization roles an owner may *assign*. `OWNER` is deliberately
 * absent: organization ownership is not transferable or grantable through
 * any path in this pass — the same restraint
 * `addOrganizationMemberRequestSchema` already observes by only ever
 * creating `MEMBER` accounts. An owner promotes someone to `EXECUTIVE` or
 * returns them to `MEMBER`; anything else is a 400, not a silently
 * ignored field.
 */
export const ASSIGNABLE_ORGANIZATION_ROLES = ["EXECUTIVE", "MEMBER"] as const;
export type AssignableOrganizationRole = (typeof ASSIGNABLE_ORGANIZATION_ROLES)[number];

export const setOrganizationMemberRoleRequestSchema = z.strictObject({
  role: z.enum(ASSIGNABLE_ORGANIZATION_ROLES),
});
export type SetOrganizationMemberRoleRequest = z.infer<typeof setOrganizationMemberRoleRequestSchema>;

export const projectMemberIdSchema = entityIdSchema;
