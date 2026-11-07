import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; issueId: string; linkId: string }>;
}

/** DELETE — removes one trace edge. `linkId` is the composite "RELATION:rowId" key `links` returns. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId, linkId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await issueService.unlinkIssue(context, projectId, issueId, linkId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
