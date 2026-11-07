import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; targetId: string }>;
}

/** GET — one surveillance target in full. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, targetId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const target = await decisionSentinelService.getSurveillanceTarget(context, projectId, targetId);
    return jsonResponse({ target });
  } catch (error) {
    return errorResponse(error);
  }
}
