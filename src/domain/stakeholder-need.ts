import { z } from "zod";
import { stakeholderNeedStatusSchema } from "./shared/enums";
import { artifactIdentifierSchema } from "./shared/identifier";

/**
 * Stakeholder need request contracts.
 *
 * The entity type itself lives in `artifacts.ts`; these are the API contracts.
 * Deliberately thin — a need records who asked for what and why, and nothing
 * more. Requirements carry the engineering rigour.
 *
 * `projectId` comes from the route and the organization from the session, so
 * `strictObject` rejects both rather than silently dropping them.
 */
export const createStakeholderNeedRequestSchema = z.strictObject({
  // Optional: omitted, the service numbers it (see auto-identifier.ts).
  identifier: artifactIdentifierSchema.optional(),
  title: z.string().trim().min(1, "A title is required").max(300),
  description: z.string().trim().min(1, "A description is required").max(10_000),
  stakeholder: z.string().trim().min(1, "A stakeholder is required").max(200),
  status: stakeholderNeedStatusSchema.optional(),
});

export type CreateStakeholderNeedRequest = z.infer<typeof createStakeholderNeedRequestSchema>;

/**
 * Status *is* editable here, unlike a requirement's.
 *
 * A need has no review lifecycle to protect — accepting or rejecting one is a
 * single editorial act, not a sequence of gated states — so a dedicated
 * transition endpoint would be ceremony without meaning.
 */
export const updateStakeholderNeedRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A title is required").max(300).optional(),
    description: z.string().trim().min(1, "A description is required").max(10_000).optional(),
    stakeholder: z.string().trim().min(1, "A stakeholder is required").max(200).optional(),
    status: stakeholderNeedStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateStakeholderNeedRequest = z.infer<typeof updateStakeholderNeedRequestSchema>;
