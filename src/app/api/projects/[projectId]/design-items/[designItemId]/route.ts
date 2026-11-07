import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as designItemService from "@/server/services/design-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; designItemId: string }>;
}

/**
 * GET — the design item with its owner, allocated requirements, any decisions
 * already recorded against it, and its audit history.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, designItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const designItem = await designItemService.getDesignItem(context, projectId, designItemId);

    return jsonResponse({ designItem });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — content only; ownership has its own endpoint so it audits separately. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, designItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const designItem = await designItemService.updateDesignItem(
      context,
      projectId,
      designItemId,
      body,
    );

    return jsonResponse({ designItem });
  } catch (error) {
    return errorResponse(error);
  }
}
