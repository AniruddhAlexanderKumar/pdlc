import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string }>;
}

/**
 * POST — move the change to another lifecycle state.
 *
 * The only way a change request's status changes. An illegal move is a 409, not
 * a silent no-op: the caller asked for something the lifecycle forbids and
 * deserves to be told.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const change = await changeService.transitionChangeRequest(context, projectId, changeId, body);

    return jsonResponse({ change });
  } catch (error) {
    return errorResponse(error);
  }
}
