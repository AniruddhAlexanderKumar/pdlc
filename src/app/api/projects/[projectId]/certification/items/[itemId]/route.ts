import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { complianceItemService } from "@/server/services/compliance-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string }>;
}

/** GET — one compliance item. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const item = await complianceItemService.getItem(context, projectId, itemId);
    return jsonResponse({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — updates a compliance item's title/description/applicability/
 * method/status/disposition.
 *
 * Applicability and disposition are always exactly what this request says —
 * nothing here, or downstream of it, derives either from a linked artifact's
 * own state.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const item = await complianceItemService.updateItem(context, projectId, itemId, body);
    return jsonResponse({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
