import {
  type AuthenticatedIdentity,
  signInRequestSchema,
  signUpRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPasswordSafely } from "@/server/auth/password";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/server/auth/rate-limit";
import { createSessionForUser, invalidateSession } from "@/server/auth/session";
import { ConflictError, UnauthorizedError } from "@/server/errors";
import * as organizationRepository from "@/server/repositories/organization.repository";
import * as userRepository from "@/server/repositories/user.repository";
import { parseOrThrow } from "@/server/validation";

/**
 * Authentication application service.
 *
 * Owns registration, sign-in and sign-out. It returns the issued session
 * token to its caller (a route handler), which is the only layer that touches
 * cookies — the service itself knows nothing about HTTP.
 *
 * Nothing here logs a password or a session token.
 */

const log = logger.child({ module: "auth" });

export interface AuthResult {
  identity: AuthenticatedIdentity;
  session: { token: string; expiresAt: Date };
}

/** URL-safe slug derived from the organization name, with a random suffix for uniqueness. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length > 0 ? base : "organization";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!(await organizationRepository.slugExists(base))) return base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    if (!(await organizationRepository.slugExists(candidate))) return candidate;
  }
  throw new ConflictError("Could not allocate an organization identifier. Try a different name.");
}

/**
 * Registers a new organization, its first user, that user's credentials and
 * an initial session — all in one transaction, so a failure part-way through
 * leaves no orphaned organization or password-less user behind.
 */
export async function register(input: unknown): Promise<AuthResult> {
  const data = parseOrThrow(signUpRequestSchema, input, "Invalid registration");

  // Checked up front for a clear message. The unique constraint below is what
  // actually guarantees it under concurrency.
  if (await userRepository.emailExists(data.email)) {
    throw new ConflictError("An account with that email address already exists.");
  }

  const slug = await uniqueSlug(data.organizationName);
  // Hashing is deliberately outside the transaction: Argon2id is designed to
  // be slow, and holding a database transaction open for it would be wasteful.
  const passwordHash = await hashPassword(data.password);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const organization = await organizationRepository.createOrganization(
        { name: data.organizationName, slug },
        tx,
      );

      const user = await userRepository.createUser(
        {
          email: data.email,
          name: data.name,
          organizationId: organization.id,
          // The person who creates the organization administers it, in both
          // the pre-existing (unenforced) sense and the real one:
          // `organizationRole: OWNER` is what real authorization now checks.
          role: "ADMIN",
          organizationRole: "OWNER",
        },
        tx,
      );

      await userRepository.createCredential({ userId: user.id, passwordHash }, tx);

      const session = await createSessionForUser(user.id, { client: tx });

      return {
        identity: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationRole: user.organizationRole,
          },
          organization: { id: organization.id, name: organization.name },
        },
        session: { token: session.token, expiresAt: session.expiresAt },
      } satisfies AuthResult;
    });

    log.info("Registered organization and first user", {
      organizationId: result.identity.organization.id,
      userId: result.identity.user.id,
    });

    return result;
  } catch (error) {
    // Losing the unique-email race gets the same message as losing it early.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      throw new ConflictError("An account with that email address already exists.");
    }
    throw error;
  }
}

/**
 * Verifies credentials and issues a session.
 *
 * Every failure — unknown email, no credential, wrong password, throttled —
 * produces the same 401 and the same message, so the endpoint cannot be used
 * to discover which addresses have accounts.
 */
export async function signIn(input: unknown): Promise<AuthResult> {
  const data = parseOrThrow(signInRequestSchema, input, "Invalid sign-in request");
  const genericFailure = new UnauthorizedError("Incorrect email address or password.");

  if (isRateLimited(data.email)) {
    log.warn("Sign-in throttled after repeated failures", { email: data.email });
    throw genericFailure;
  }

  const account = await userRepository.findAuthRecordByEmail(data.email);

  // Always runs a real Argon2id verification, against the account's own
  // hash when one exists and against a fixed decoy otherwise — see
  // verifyPasswordSafely's own doc comment. Without this, an email with no
  // account returned as soon as the lookup missed, while a real email with
  // the wrong password additionally paid for a full hash computation: an
  // easily-measurable timing gap that leaks which emails have accounts even
  // though every response here carries the identical generic message.
  const passwordMatches = await verifyPasswordSafely(
    account?.credential?.passwordHash,
    data.password,
  );

  if (!account?.credential || !passwordMatches) {
    recordFailedAttempt(data.email);
    if (account) log.warn("Failed sign-in attempt", { userId: account.id });
    throw genericFailure;
  }

  clearAttempts(data.email);
  const session = await createSessionForUser(account.id);

  return {
    identity: {
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        organizationRole: account.organizationRole,
      },
      organization: { id: account.organization.id, name: account.organization.name },
    },
    session: { token: session.token, expiresAt: session.expiresAt },
  };
}

/** Invalidates the session server-side. Idempotent, and never reveals whether it existed. */
export async function signOut(token: string | undefined | null): Promise<void> {
  await invalidateSession(token);
}
