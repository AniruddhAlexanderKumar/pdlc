import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; evidenceId: string; linkId: string }>;
}

/** DELETE — removes one trace edge. `linkId` is the composite "RELATION:rowId" key `links` returns. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId, linkId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await evidenceService.unlinkEvidence(context, projectId, evidenceId, linkId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
