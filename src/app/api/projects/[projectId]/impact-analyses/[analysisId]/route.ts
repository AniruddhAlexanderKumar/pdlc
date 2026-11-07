import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { changeImpactAnalysisService } from "@/server/services/change-impact-analysis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; analysisId: string }>;
}

/**
 * GET — one analysis in full, by id.
 *
 * Scoped to the project, so an analysis id guessed from another project — or
 * another organization — is simply not found rather than refused.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, analysisId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const report = await changeImpactAnalysisService.getImpactAnalysis(
      context,
      projectId,
      analysisId,
    );

    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
