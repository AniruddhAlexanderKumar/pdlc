import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string }>;
}

/**
 * GET — one baseline with its membership and history.
 *
 * Each member carries both what was baselined and what the object looks like
 * now, so a reader can see what an evaluation would find. That comparison is a
 * read: it records nothing and changes nothing.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const baseline = await driftDetectionService.getBaseline(context, projectId, baselineId);

    return jsonResponse({ baseline });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — edit a DRAFT baseline's name or description.
 *
 * There is no `status` field: activation and supersession are their own
 * operations, so neither can happen as a side effect of an ordinary edit. An
 * ACTIVE or SUPERSEDED baseline is refused — it is the fixed reference every
 * drift assessment was computed against.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const baseline = await driftDetectionService.updateBaseline(
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
