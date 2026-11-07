import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string }>;
}

/**
 * POST — retire an ACTIVE baseline.
 *
 * The record stays readable and immutable: drift assessments computed against it
 * remain interpretable, and the history of what was approved when survives.
 * There is no delete anywhere in this module for the same reason.
 */
export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const baseline = await driftDetectionService.supersedeBaseline(
      context,
      projectId,
      baselineId,
    );

    return jsonResponse({ baseline });
  } catch (error) {
    return errorResponse(error);
  }
}
