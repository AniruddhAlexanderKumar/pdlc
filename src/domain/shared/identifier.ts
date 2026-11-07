import { z } from "zod";

/**
 * Identifier rules.
 *
 * Two different kinds of identity exist in this system and must not be
 * confused:
 *
 *  - **Entity id** — the opaque storage key (cuid). Never shown to engineers,
 *    never meaningful, stable forever.
 *  - **Artifact identifier** — the human-facing key an engineer says out loud
 *    ("REQ-014"). Unique *within a project*, not globally: two programs may
 *    both have a REQ-001, and that is correct.
 */

/** Opaque storage key. Deliberately not cuid-shape-specific — only that it is a sane key. */
export const entityIdSchema = z
  .string()
  .trim()
  .min(1, "An entity id is required")
  .max(64, "Entity id is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Entity id contains invalid characters");

/**
 * Human-facing artifact identifier, e.g. "REQ-001", "ED-14", "CR-1042".
 * House convention: uppercase alphanumerics, dashes and underscores, 2–32
 * characters. Case is significant so that identifiers sort and read
 * predictably in exported traceability matrices.
 */
export const ARTIFACT_IDENTIFIER_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export const artifactIdentifierSchema = z
  .string()
  .trim()
  .min(2, "An artifact identifier must be at least 2 characters")
  .max(32, "An artifact identifier must be at most 32 characters")
  .regex(
    ARTIFACT_IDENTIFIER_PATTERN,
    "An artifact identifier must be uppercase alphanumerics, dashes or underscores (e.g. REQ-001)",
  );

export function isValidArtifactIdentifier(value: string): boolean {
  return artifactIdentifierSchema.safeParse(value).success;
}

/**
 * A project-scoped artifact identity. Artifact identifiers are only
 * meaningful alongside the project that owns them, so the domain carries the
 * two together rather than passing a bare string around.
 */
export const projectScopedIdentifierSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
});

export type ProjectScopedIdentifier = z.infer<typeof projectScopedIdentifierSchema>;
