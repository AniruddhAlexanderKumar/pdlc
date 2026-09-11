import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { complianceItemService } from "@/server/services/compliance-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string; linkId: string }>;
}

/** DELETE — removes one compliance link. `linkId` is the composite "LINK_TYPE:rowId" key `links` returns. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId, linkId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    await complianceItemService.removeLink(context, projectId, itemId, linkId);
    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
