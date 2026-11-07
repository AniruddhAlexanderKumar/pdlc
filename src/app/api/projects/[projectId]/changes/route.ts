import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — change requests in the project, newest first. Optional `?status=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const changes = await changeService.listChangeRequests(context, projectId, {
      status: status ?? undefined,
    });

    return jsonResponse({ changes });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — raise a change request in DRAFT.
 *
 * The requester is taken from the session, never from the body. The create
 * contract has no `requestedById` and no `status`, so an attempt to supply
 * either is rejected rather than ignored.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const change = await changeService.createChangeRequest(context, projectId, body);

    return jsonResponse({ change }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
