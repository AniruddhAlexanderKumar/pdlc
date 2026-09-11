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
}

export async function createUser(
  input: CreateUserInput,
  client: DbClient = prisma,
): Promise<{ id: string; name: string; email: string; role: string }> {
  return client.user.create({
    data: {
      email: input.email,
      name: input.name,
      organizationId: input.organizationId,
      role: input.role ?? "ENGINEER",
    },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function createCredential(
  input: { userId: string; passwordHash: string },
  client: DbClient = prisma,
): Promise<void> {
  await client.userCredential.create({ data: input });
}

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
}

/**
 * Members of one organization, for owner selection.
 *
 * Explicitly selects three safe fields — no credential relation, no role
 * internals, no organization id echoed back to the browser.
 */
export async function listOrganizationMembers(
  organizationId: string,
  client: DbClient = prisma,
): Promise<OrganizationMember[]> {
  return client.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
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
