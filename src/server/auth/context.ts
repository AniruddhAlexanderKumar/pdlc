import type { AuthenticatedIdentity } from "@/domain";
import { UnauthorizedError } from "@/server/errors";
import { readSessionCookie } from "./cookies";
import { resolveSession } from "./session";

/**
 * The single place where `cookie → session → user → organization` happens.
 *
 * Route handlers, layouts and services all take the result of this; none of
 * them parse cookies or query sessions themselves. That matters beyond tidiness:
 * tenancy is only trustworthy if there is exactly one path by which
 * `organizationId` can enter a request, and this is it. Nothing the client
 * sends is ever consulted.
 */

export interface AuthenticatedContext extends AuthenticatedIdentity {
  /**
   * Structurally satisfies `OrganizationContext`, so application services
   * take this directly and cannot be handed a client-supplied tenancy.
   */
  organizationId: string;
  actorId: string;
  sessionId: string;
}

/** Resolves the caller, or null when unauthenticated. Never throws on a bad cookie. */
export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const token = await readSessionCookie();
  const session = await resolveSession(token);

  if (!session) return null;

  const { user } = session;

  return {
    organizationId: user.organization.id,
    actorId: user.id,
    sessionId: session.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
    },
  };
}

/**
 * Same, but throws `UnauthorizedError` (401) when there is no valid session.
 * Use in API routes; pages redirect instead.
 */
export async function requireAuthenticatedContext(): Promise<AuthenticatedContext> {
  const context = await getAuthenticatedContext();
  if (!context) {
    throw new UnauthorizedError();
  }
  return context;
}

/** The safe subset sent to the browser — no session id, no credential state. */
export function toIdentity(context: AuthenticatedContext): AuthenticatedIdentity {
  return { user: context.user, organization: context.organization };
}
