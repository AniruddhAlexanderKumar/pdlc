import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — every OPEN or ACKNOWLEDGED surveillance target, newest first. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const targets = await decisionSentinelService.listOpenSurveillance(context, projectId);
    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
