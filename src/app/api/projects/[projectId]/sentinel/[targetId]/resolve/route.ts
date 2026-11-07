import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; targetId: string }>;
}

/**
 * POST — resolves a surveillance target: `{note}`, note required.
 *
 * Resolution always requires objective evidence recorded as a note — a new
 * current assessment, or an explicit engineering judgement that no
 * reevaluation is necessary. There is no path that resolves a target
 * silently.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, targetId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const target = await decisionSentinelService.resolveSurveillance(context, projectId, targetId, body);
    return jsonResponse({ target });
  } catch (error) {
    return errorResponse(error);
  }
}
