import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; assumptionId: string }>;
}

/**
 * GET — current monitoring state for one assumption.
 *
 * Reading never evaluates. A stale verdict is reported as it stands, because
 * silently recomputing on every page load would make "when was this last
 * checked?" unanswerable.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const state = await assumptionMonitoringService.getAssumptionStatus(
      context,
      projectId,
      decisionId,
      assumptionId,
    );

    return jsonResponse({ state });
  } catch (error) {
    return errorResponse(error);
  }
}
