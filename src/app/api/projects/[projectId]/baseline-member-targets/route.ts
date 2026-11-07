import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — everything in this project that may be added to a baseline.
 *
 * Populates the membership picker, keyed by the seven baselineable node types.
 * Project-scoped, so it can only offer objects the caller already has access to
 * — the same boundary the membership write enforces, so the picker cannot
 * suggest something the server would refuse.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const targets = await driftDetectionService.listBaselineMemberTargets(context, projectId);

    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
