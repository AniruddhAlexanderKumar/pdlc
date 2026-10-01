import { z } from "zod";
import { designItemStatusSchema, designItemTypeSchema } from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * Design item request contracts. The entity type lives in `artifacts.ts`.
 *
 * A design item is a node in the product structure — a system, subsystem,
 * assembly, component or software element. There is no CAD, geometry or
 * version-controlled artifact here: this exists so requirements have something
 * real to be allocated to.
 */
export const createDesignItemRequestSchema = z.strictObject({
  // Optional: omitted, the service numbers it (see auto-identifier.ts).
  identifier: artifactIdentifierSchema.optional(),
  name: z.string().trim().min(1, "A name is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
  itemType: designItemTypeSchema,
  status: designItemStatusSchema.optional(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateDesignItemRequest = z.infer<typeof createDesignItemRequestSchema>;

/**
 * Ownership is absent: it has its own endpoint so it audits as its own event,
 * matching how requirements handle the same concern.
 */
export const updateDesignItemRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1, "A name is required").max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
    itemType: designItemTypeSchema.optional(),
    status: designItemStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateDesignItemRequest = z.infer<typeof updateDesignItemRequestSchema>;

/** Assigns an owner, or clears one with an explicit null. */
export const assignDesignItemOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignDesignItemOwnerRequest = z.infer<typeof assignDesignItemOwnerRequestSchema>;
