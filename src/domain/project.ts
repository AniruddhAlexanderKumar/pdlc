import { z } from "zod";
import { type ProjectStatus, projectStatusSchema } from "./shared/enums";
import { entityIdSchema } from "./shared/identifier";

/**
 * A development program or product. Every engineering artifact in the system
 * is scoped to exactly one project, and artifact identifiers are unique
 * within it.
 */
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Runtime shape of a Project. Useful at trust boundaries (imports, fixtures,
 * cross-process payloads) and as the executable definition of the entity —
 * note that nothing here refers to Prisma.
 */
export const projectSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  name: z.string().trim().min(1),
  description: z.string().nullable(),
  status: projectStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Project>;

export const createProjectInputSchema = z.object({
  organizationId: entityIdSchema,
  name: z.string().trim().min(1, "A project name is required").max(200),
  description: z.string().trim().max(4000).nullish(),
  status: projectStatusSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullish(),
    status: projectStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

/**
 * API request contracts — what an external caller may supply.
 *
 * Distinct from the `*InputSchema` pair above, which describe what the
 * repository needs (including `organizationId`, which comes from the request
 * context, never from the caller). These live in the domain layer rather than
 * beside the service because the browser needs them too: the project form
 * validates against exactly the same rules the API enforces, so there is one
 * definition rather than a client copy that can drift.
 *
 * `strictObject`, so a caller sending `organizationId`, `status`, `id` or a
 * timestamp gets a validation failure instead of having it silently dropped.
 */
export const createProjectRequestSchema = z.strictObject({
  name: z.string().trim().min(1, "A project name is required").max(200),
  description: z.string().trim().max(4000).nullish(),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1, "A project name is required").max(200).optional(),
    description: z.string().trim().max(4000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
