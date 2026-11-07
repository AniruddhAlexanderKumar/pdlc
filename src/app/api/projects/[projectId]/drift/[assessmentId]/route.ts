import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; assessmentId: string }>;
}

/**
 * GET — one drift assessment in full, by id.
 *
 * Scoped to the project, so an id guessed from another project — or another
 * organization — is simply not found rather than refused. The API does not
 * confirm the existence of what it will not show.
 *
 * A historical assessment is returned exactly as it was recorded: the findings
 * and the basis it was written with, never re-judged under today's state,
 * because the value of a drift record is that it says what had diverged *then*.
 * Its freshness against the present is reported alongside.
 *
 * There is no PATCH, PUT or DELETE. Drift assessments are engineering evidence,
 * and immutability is structural rather than a convention.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, assessmentId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const report = await driftDetectionService.explainDrift(context, projectId, assessmentId);

    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
