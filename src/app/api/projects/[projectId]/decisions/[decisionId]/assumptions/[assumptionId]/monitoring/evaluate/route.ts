import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; assumptionId: string }>;
}

/**
 * POST — evaluate this assumption's basis now.
 *
 * Appends a record to the history. The assumption's own status is never touched
 * by this: the engine reports that the basis moved, and only an engineer's
 * review changes what the assumption is held to be.
 */
export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const state = await assumptionMonitoringService.evaluateAssumption(
      context,
      projectId,
      decisionId,
      assumptionId,
    );

    return jsonResponse({ state }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
