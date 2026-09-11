import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as suppliedItemService from "@/server/services/supplied-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; suppliedItemId: string }>;
}

/**
 * GET — one supplied item with its supplier, every engineering object it is
 * linked to, its qualifications and its audit history.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, suppliedItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const suppliedItem = await suppliedItemService.getSuppliedItem(
      context,
      projectId,
      suppliedItemId,
    );

    return jsonResponse({ suppliedItem });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — update name, description, type or status.
 *
 * The supplier is deliberately absent: re-parenting an item would silently
 * rewrite what every existing engineering link means. A new item is recorded
 * instead, and the old one marked OBSOLETE.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, suppliedItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const suppliedItem = await suppliedItemService.updateSuppliedItem(
      context,
      projectId,
      suppliedItemId,
      body,
    );

    return jsonResponse({ suppliedItem });
  } catch (error) {
    return errorResponse(error);
  }
}
