import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { getRequirementVerificationMatrix } from "@/server/services/traceability-matrix.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/traceability-matrix
 *
 * Requirement × Verification Activity coverage: real, existing
 * `RequirementVerificationLink` rows only — nothing evaluated, nothing
 * derived. A project in another organization 404s, the same as every
 * other project-scoped route.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const matrix = await getRequirementVerificationMatrix(context, projectId);

    return jsonResponse({ matrix });
  } catch (error) {
    return errorResponse(error);
  }
}
