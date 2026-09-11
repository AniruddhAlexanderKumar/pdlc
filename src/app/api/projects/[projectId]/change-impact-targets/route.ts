import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the artifacts in this project a change may declare an impact on.
 *
 * Feeds the declared-impact selector, so a user picks a real artifact rather
 * than typing a type and an id. Project-scoped, so the picker can only ever
 * offer what the caller already has access to.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const targets = await changeService.listChangeImpactTargets(context, projectId);

    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
