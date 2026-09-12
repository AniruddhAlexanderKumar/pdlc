import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string }>;
}

/**
 * GET — a deterministic snapshot-vs-current comparison for this baseline.
 *
 * A read, in any baseline status (DRAFT included): nothing here evaluates
 * drift, and nothing here writes. `GET` is the only verb this route exports.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const comparison = await driftDetectionService.compareBaseline(context, projectId, baselineId);

    return jsonResponse({ comparison });
  } catch (error) {
    return errorResponse(error);
  }
}
