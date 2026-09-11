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
