import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { changeImpactAnalysisService } from "@/server/services/change-impact-analysis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string }>;
}

/**
 * GET — the most recent analysis, with its freshness.
 *
 * Returns a `NOT_RUN` shape rather than an empty report when nothing has been
 * run: zero counts would read as "we looked and found nothing", which is a far
 * stronger claim than "nobody has looked".
 *
 * Freshness is derived here by comparing fingerprints. Reading never triggers a
 * re-run — a stale result is reported as stale, not quietly refreshed.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const latest = await changeImpactAnalysisService.getLatestImpactAnalysis(
      context,
      projectId,
      changeId,
    );

    return jsonResponse({ latest });
  } catch (error) {
    return errorResponse(error);
  }
}
