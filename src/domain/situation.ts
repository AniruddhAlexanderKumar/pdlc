import { z } from "zod";

/**
 * The request contract for the situation-aware assistant.
 *
 * Lives here rather than in the route because every other client-facing
 * schema in this product does — and because `strictObject` is the
 * mass-assignment guard `src/tests/security/mass-assignment.test.ts`
 * enforces across the board. The route this belongs to originally parsed
 * its body by hand with `typeof body.pathname === "string"`, which accepts
 * any number of unknown fields silently; that is the one shape of request
 * parsing this codebase does not allow anywhere else.
 *
 * `pathname` is a *hint about what the reader is looking at*, never an
 * authorization input. The assistant answers from a static route table, so
 * a caller who lies about their pathname learns only what that table says
 * about a page they could have navigated to anyway. Nothing is read from
 * the database on the strength of it.
 */
export const situationRequestSchema = z.strictObject({
  pathname: z.string().trim().min(1).max(512).optional(),
  userMessage: z.string().trim().max(2000).optional(),
});

export type SituationRequest = z.infer<typeof situationRequestSchema>;
