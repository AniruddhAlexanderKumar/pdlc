import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { complianceItemService } from "@/server/services/compliance-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — everything in the project a compliance item may link to, keyed by the eight link types. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const targets = await complianceItemService.listLinkTargets(context, projectId);
    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
