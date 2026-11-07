import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { technicalReadinessService } from "@/server/services/technical-readiness.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; assessmentId: string }>;
}

/**
 * GET — one gate assessment in full, by id.
 *
 * Scoped to the project, so an assessment id guessed from another project — or
 * another organization — is simply not found rather than refused. The API does
 * not confirm the existence of what it will not show.
 *
 * A historical assessment is returned exactly as it was recorded: the findings
 * and the scope it was written with, never re-judged under today's state. Its
 * freshness against the state as it stands now is reported alongside, so a
 * reader can see both what was believed then and whether it still holds.
 *
 * There is no PATCH, PUT or DELETE here. Gate assessments are engineering
 * evidence, and immutability is structural rather than a convention.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, assessmentId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const report = await technicalReadinessService.explainTechnicalReadiness(
      context,
      projectId,
      assessmentId,
    );

    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
