import { situationRequestSchema } from "@/domain/situation";
import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { parseOrThrow } from "@/server/validation";
import { extractSituationContext, generateSituationalAnalysis } from "@/lib/ai/situation-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/situation-aware
 *
 * What the assistant can say about the page the reader is on. Despite the
 * path, nothing here calls a model: `extractSituationContext` matches the
 * route against a static table and `generateSituationalAnalysis` composes
 * text from it, both pure and deterministic. The same input returns the
 * same answer, which is the only way an assistant belongs in a product that
 * refuses inferred engineering judgment everywhere else.
 *
 * Three things were corrected here after the first version:
 *
 * - It built its own responses with `NextResponse.json` and returned
 *   `details: error.message` on failure. That made it the only route of 146
 *   (outside the two deliberate health probes) to bypass `errorResponse`,
 *   and it handed internal exception text to the client — contradicting the
 *   sanitized-error property SECURITY.md claims and `response.test.ts`
 *   verifies.
 * - It parsed its body by hand, accepting any unknown field silently.
 * - It reported `user.role` as the reader's "access role". That column is
 *   vestigial: ARCHITECTURE.md records that it is "carried on the session,
 *   never branched on anywhere in server code". Telling someone they hold
 *   `ADMIN` names an authority that grants nothing. The assistant now
 *   reports `organizationRole`, which is the one actually enforced.
 */
export async function POST(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const body = await request.json().catch(() => ({}));
    const input = parseOrThrow(situationRequestSchema, body, "Invalid situation request");

    const situation = extractSituationContext(
      input.pathname ?? "/dashboard",
      context.user.organizationRole,
    );

    return jsonResponse({
      situation,
      analysis: generateSituationalAnalysis(situation, input.userMessage),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
