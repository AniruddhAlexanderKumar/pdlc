import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string; impactId: string }>;
}

/**
 * DELETE — withdraw a declared impact.
 *
 * The impact is resolved through its change request, so an id belonging to a
 * different change cannot be removed by guessing it.
 */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId, impactId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const impacts = await changeService.removeDeclaredImpact(
      context,
      projectId,
      changeId,
      impactId,
    );

    return jsonResponse({ impacts });
  } catch (error) {
    return errorResponse(error);
  }
}
