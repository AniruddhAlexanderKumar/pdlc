import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; issueId: string }>;
}

/**
 * POST /api/projects/[projectId]/issues/[issueId]/owner
 *
 * Assigns an owner, or clears one with `{ ownerId: null }`. The owner must be
 * a member of the session's organization — an id from anywhere else is
 * rejected rather than stored.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const issue = await issueService.assignIssueOwner(context, projectId, issueId, body);

    return jsonResponse({ issue });
  } catch (error) {
    return errorResponse(error);
  }
}
