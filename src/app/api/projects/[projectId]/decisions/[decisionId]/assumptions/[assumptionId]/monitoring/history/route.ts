import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; assumptionId: string }>;
}

/**
 * GET — the append-only monitoring history, newest first.
 *
 * Evaluations and reviews share one timeline, so a reader sees both what was
 * detected and what a person then decided about it. Nothing here is ever
 * rewritten.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const history = await assumptionMonitoringService.getMonitoringHistory(
      context,
      projectId,
      decisionId,
      assumptionId,
    );

    return jsonResponse({ history });
  } catch (error) {
    return errorResponse(error);
  }
}
