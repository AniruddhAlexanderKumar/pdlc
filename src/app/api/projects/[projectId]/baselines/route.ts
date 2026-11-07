import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — engineering baselines in the project, newest first.
 *
 * Superseded baselines are included. The history of what was approved when is
 * the point; hiding old baselines would remove the reference every historical
 * drift assessment was computed against.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const baselines = await driftDetectionService.listBaselines(context, projectId);

    return jsonResponse({ baselines });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — record a new baseline, in DRAFT.
 *
 * Creation and activation are separate: a baseline is assembled first and fixed
 * deliberately, because activation is the moment the engineering basis becomes
 * the thing every later comparison is against.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const baseline = await driftDetectionService.createBaseline(context, projectId, body);

    return jsonResponse({ baseline }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
