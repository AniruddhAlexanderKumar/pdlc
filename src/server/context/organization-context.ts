/**
 * The tenancy boundary for a request.
 *
 * Every application service takes this explicitly and scopes all reads and
 * writes through `organizationId`. Nothing downstream may look an artifact up
 * by id alone, so cross-organization access cannot happen by omission.
 *
 * This is a type only. The sole implementation is
 * `requireAuthenticatedContext()` in `src/server/auth/context.ts`, which
 * derives it from the session cookie — a client can neither supply nor
 * influence it. (The development resolver that previously produced this
 * shape has been removed now that real authentication exists.)
 */
export interface OrganizationContext {
  organizationId: string;
  /** Who performed the action, for audit attribution. Null for system actions. */
  actorId: string | null;
}
