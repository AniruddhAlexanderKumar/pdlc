import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string }>;
}

/** GET — the change with its declared impacts, legal transitions and history. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const change = await changeService.getChangeRequest(context, projectId, changeId);

    return jsonResponse({ change });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — edit the change definition.
 *
 * Content only. There is no `status` field in the contract, so this cannot move
 * a change through its lifecycle; that is what the transition endpoint is for.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const change = await changeService.updateChangeRequest(context, projectId, changeId, body);

    return jsonResponse({ change });
  } catch (error) {
    return errorResponse(error);
  }
}
