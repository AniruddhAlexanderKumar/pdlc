import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string }>;
}

/**
 * POST — fix this baseline as the approved engineering basis.
 *
 * From this point its membership is immutable, and every drift assessment
 * compares against the snapshots it holds.
 *
 * If another baseline is already ACTIVE, this is **refused** unless the body
 * carries `supersedeActive: true`. Nothing replaces an engineering basis
 * silently: a quiet swap would make every later drift result impossible to
 * interpret, because the reader could not tell which basis it was against.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const baseline = await driftDetectionService.activateBaseline(
      context,
      projectId,
      baselineId,
      body,
    );

    return jsonResponse({ baseline });
  } catch (error) {
    return errorResponse(error);
  }
}
