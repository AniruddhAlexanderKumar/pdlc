import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as designItemService from "@/server/services/design-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; designItemId: string }>;
}

/**
 * POST — assign an owner, or clear one with `{ ownerId: null }`.
 * The owner must be a member of the session's organization.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, designItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const designItem = await designItemService.assignDesignItemOwner(
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
