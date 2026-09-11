import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; riskId: string; linkId: string }>;
}

/** DELETE — removes one trace edge. `linkId` is the composite "RELATION:rowId" key `links` returns. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId, linkId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await riskService.unlinkRisk(context, projectId, riskId, linkId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
