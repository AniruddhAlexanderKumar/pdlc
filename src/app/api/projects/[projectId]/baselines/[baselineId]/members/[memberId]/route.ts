import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string; memberId: string }>;
}

/**
 * DELETE — remove one object from a DRAFT baseline.
 *
 * Refused once the baseline is ACTIVE. The member id is looked up through its
 * baseline, so an id guessed from another baseline is not found rather than
 * removed.
 */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId, memberId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await driftDetectionService.removeBaselineMember(
      context,
      projectId,
      baselineId,
      memberId,
    );

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
