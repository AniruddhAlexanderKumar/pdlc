import { type DbClient, prisma } from "@/lib/db";

/**
 * Session persistence.
 *
 * Only token *hashes* cross this boundary — the raw token exists solely in
 * the cookie and in the request that carried it.
 */

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionWithPrincipal {
  id: string;
  expiresAt: Date;
  lastSeenAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationRole: string;
    organization: { id: string; name: string };
  };
}

export async function createSession(
  input: CreateSessionInput,
  client: DbClient = prisma,
): Promise<{ id: string; expiresAt: Date }> {
  const session = await client.session.create({
    data: input,
    select: { id: true, expiresAt: true },
  });
  return session;
}

/**
 * Loads a session with the user and organization needed to build a request
 * context, in one indexed read on the unique `tokenHash`.
 *
 * `select` is explicit so a password hash can never be pulled along by a
 * future relation change.
 */
export async function findSessionByTokenHash(
  tokenHash: string,
  client: DbClient = prisma,
): Promise<SessionWithPrincipal | null> {
  return client.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationRole: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** Records activity. Called at most once per session per day — see session.ts. */
export async function touchSession(
  sessionId: string,
  lastSeenAt: Date,
  client: DbClient = prisma,
): Promise<void> {
  await client.session.update({ where: { id: sessionId }, data: { lastSeenAt } });
}

/**
 * Deletes a session by token hash. Uses `deleteMany` so signing out with an
 * already-deleted or unknown token is a no-op rather than an error.
 */
export async function deleteSessionByTokenHash(
  tokenHash: string,
  client: DbClient = prisma,
): Promise<void> {
  await client.session.deleteMany({ where: { tokenHash } });
}

/** Removes expired rows. Not scheduled anywhere yet — see ARCHITECTURE.md. */
export async function deleteExpiredSessions(
  now: Date,
  client: DbClient = prisma,
): Promise<number> {
  const { count } = await client.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
