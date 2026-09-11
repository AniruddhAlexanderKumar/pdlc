import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST — evaluate every assumption in the project.
 *
 * An explicit sweep, not a scheduler. It is what a future surveillance loop
 * would call, but nothing calls it on its own today, and the counts returned
 * are derived from evaluations that actually ran.
 */
export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const summary = await assumptionMonitoringService.evaluateProjectAssumptions(
      context,
      projectId,
    );

    return jsonResponse({ summary }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
