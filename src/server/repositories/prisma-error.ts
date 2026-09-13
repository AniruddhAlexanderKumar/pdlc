import { ConflictError } from "@/server/errors";

/**
 * Prisma error codes we translate into domain errors. Checked structurally
 * rather than via `instanceof` so this stays independent of which Prisma
 * runtime class the generated client happens to throw.
 *
 * P2002 — unique constraint violation
 * P2003 — foreign key constraint violation
 * P2025 — required record not found
 */
function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return prismaErrorCode(error) === "P2003";
}

export function isRecordNotFound(error: unknown): boolean {
  return prismaErrorCode(error) === "P2025";
}

/**
 * Rethrows a unique-constraint violation as a `ConflictError` carrying a
 * message the caller can show; anything else propagates untouched.
 */
export function rethrowAsConflict(error: unknown, message: string): never {
  if (isUniqueConstraintViolation(error)) {
    throw new ConflictError(message);
  }
  throw error;
}

/**
 * Guards a "read state, decide, write state" transition against another
 * transaction changing the same row in between.
 *
 * Prisma's typed `update()` only accepts a `where` that resolves to a unique
 * constraint or id, so it cannot also require "and the row is still in the
 * state I read". `updateMany()` has no such restriction: the guarded write
 * folds the state the decision was based on into its `where`, and this
 * checks the row count that comes back. One means the row was still in that
 * state at the moment the write landed, so the decision still holds. Zero
 * means another transaction already moved it — the decision was made against
 * state that no longer exists, and applying it anyway would silently
 * overwrite whatever that other transaction just did.
 */
export function assertGuardedTransition(count: number, message: string): void {
  if (count === 0) {
    throw new ConflictError(message);
  }
}
