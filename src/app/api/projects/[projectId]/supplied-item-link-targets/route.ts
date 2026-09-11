import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as suppliedItemService from "@/server/services/supplied-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — everything in this project a supplied item may be linked to.
 *
 * Populates the relationship picker. Project-scoped, so it can only ever offer
 * artifacts the caller already has access to — the same boundary the link write
 * itself enforces, so the picker cannot suggest something the server will refuse.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const targets = await suppliedItemService.listSuppliedItemLinkTargets(context, projectId);

    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
