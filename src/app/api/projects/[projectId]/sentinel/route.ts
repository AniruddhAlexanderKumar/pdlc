import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the project's real surveillance counts (open, acknowledged). Never a
 * risk score, a health score, or an alert-volume estimate — just the actual
 * count of rows in each status.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const counts = await decisionSentinelService.getSurveillanceCounts(context, projectId);
    return jsonResponse({ counts });
  } catch (error) {
    return errorResponse(error);
  }
}
