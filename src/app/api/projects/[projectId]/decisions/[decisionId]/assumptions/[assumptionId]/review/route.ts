import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; assumptionId: string }>;
}

/**
 * POST — an engineer's explicit review.
 *
 * The only path by which monitoring touches an assumption's status, and even
 * here the judgement is the reviewer's: the status moves only if they supplied
 * one. The reviewer is taken from the session, so the review contract carries
 * no reviewer field and a client that sends one is rejected.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request).catch(() => ({}));

    const state = await assumptionMonitoringService.reviewAssumption(
      context,
      projectId,
      decisionId,
      assumptionId,
      body ?? {},
    );

    return jsonResponse({ state }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
