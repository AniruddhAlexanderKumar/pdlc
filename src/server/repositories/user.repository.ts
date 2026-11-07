import type { OrganizationRole } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * User and credential persistence for authentication.
 *
 * Password hashes are only ever returned by {@link findAuthRecordByEmail},
 * which exists specifically for the sign-in path. Ordinary user reads select
 * explicit fields and never touch the credential relation.
 */

export interface AuthRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationRole: string;
  organization: { id: string; name: string };
  credential: { passwordHash: string } | null;
}

/** Looks up a user for authentication. The email must already be normalized. */
export async function findAuthRecordByEmail(
  email: string,
  client: DbClient = prisma,
): Promise<AuthRecord | null> {
  return client.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationRole: true,
      organization: { select: { id: true, name: true } },
      credential: { select: { passwordHash: true } },
    },
  });
}

export async function emailExists(email: string, client: DbClient = prisma): Promise<boolean> {
  const user = await client.user.findUnique({ where: { email }, select: { id: true } });
  return user !== null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  organizationId: string;
  role?: "ADMIN" | "ENGINEER" | "VIEWER";
  organizationRole?: "OWNER" | "MEMBER";
}

export async function createUser(
  input: CreateUserInput,
  client: DbClient = prisma,
): Promise<{ id: string; name: string; email: string; role: string; organizationRole: string }> {
  return client.user.create({
    data: {
      email: input.email,
      name: input.name,
      organizationId: input.organizationId,
      role: input.role ?? "ENGINEER",
      organizationRole: input.organizationRole ?? "MEMBER",
    },
    select: { id: true, name: true, email: true, role: true, organizationRole: true },
  });
}

export async function createCredential(
  input: { userId: string; passwordHash: string },
  client: DbClient = prisma,
): Promise<void> {
  await client.userCredential.create({ data: input });
}

/**
 * Sets one user's organization role, scoped by `organizationId` as well as
 * `userId` so a user id from another tenant can never be updated through
 * this path. Returns `null` when no row in this organization matched,
 * which the service turns into a 404 rather than reporting a successful
 * write that did not happen.
 */
export async function updateOrganizationRole(
  input: { userId: string; organizationId: string; role: OrganizationRole },
  client: DbClient = prisma,
): Promise<{ id: string; name: string; organizationRole: OrganizationRole } | null> {
  const result = await client.user.updateMany({
    where: { id: input.userId, organizationId: input.organizationId },
    data: { organizationRole: input.role },
  });
  if (result.count === 0) return null;

  const user = await client.user.findFirst({
    where: { id: input.userId, organizationId: input.organizationId },
    select: { id: true, name: true, organizationRole: true },
  });
  return user;
}

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  organizationRole: OrganizationRole;
  createdAt: Date;
  /** How many projects this user holds an explicit membership row on. */
  projectCount: number;
}

/**
 * Members of one organization — for the People page, and for the
 * project-member picker.
 *
 * Explicitly selects only safe fields: no credential relation and no
 * organization id echoed back to the browser. `organizationRole` is
 * included deliberately — "who here can administer this organization" is
 * exactly the question the People page exists to answer, and it is already
 * carried on every session anyway.
 */
export async function listOrganizationMembers(
  organizationId: string,
  client: DbClient = prisma,
): Promise<OrganizationMember[]> {
  const rows = await client.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      organizationRole: true,
      createdAt: true,
      _count: { select: { projectMemberships: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    organizationRole: row.organizationRole,
    createdAt: row.createdAt,
    projectCount: row._count.projectMemberships,
  }));
}

/** True when the user exists *and* belongs to the given organization. */
export async function isMemberOfOrganization(
  userId: string,
  organizationId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const user = await client.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true },
  });
  return user !== null;
}

/**
 * A user's real, current organization role — read fresh, never trusted from
 * a request context. Scoped by `organizationId` as well as `userId`, so a
 * user id from a different organization (which should never reach here
 * given `OrganizationContext`'s own guarantees) resolves to `null` rather
 * than another tenant's role.
 *
 * Typed as the real `OrganizationRole` union rather than `string`: this
 * value now selects an implicit project role (`implicitProjectRole`), so a
 * role the domain does not know about should fail to compile here rather
 * than fall through a comparison at runtime.
 */
export async function getOrganizationRole(
  userId: string,
  organizationId: string,
  client: DbClient = prisma,
): Promise<OrganizationRole | null> {
  const user = await client.user.findFirst({
    where: { id: userId, organizationId },
    select: { organizationRole: true },
  });
  return user?.organizationRole ?? null;
}
