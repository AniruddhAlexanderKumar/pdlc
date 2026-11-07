import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; targetId: string }>;
}

/**
 * POST — acknowledges a surveillance target: `{note?}`.
 *
 * Acknowledgement means only "an engineer has seen this" — never "fixed" or
 * "safe". It never resolves the target on its own.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, targetId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const target = await decisionSentinelService.acknowledgeSurveillance(context, projectId, targetId, body);
    return jsonResponse({ target });
  } catch (error) {
    return errorResponse(error);
  }
}
