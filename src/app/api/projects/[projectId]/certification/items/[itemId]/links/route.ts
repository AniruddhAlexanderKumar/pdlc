import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { complianceItemService } from "@/server/services/compliance-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string }>;
}

/** GET — every typed link on this compliance item, across all eight link types. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const links = await complianceItemService.listLinks(context, projectId, itemId);
    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — links this compliance item to a real engineering (or governance)
 * object: `{linkType, targetId, note?}`. The target is re-resolved inside
 * this project, so an id from another project cannot be linked.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const link = await complianceItemService.addLink(context, projectId, itemId, body);
    return jsonResponse({ link }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
