import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; issueId: string }>;
}

/** GET — every trace edge on the issue, with enough of each target to display it. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const links = await issueService.listIssueLinks(context, projectId, issueId);

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — links this issue to a real requirement, design item or engineering
 * decision: `{relation, targetId, note?}`. The target is re-resolved inside
 * this project, so an id from another project cannot be linked.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const link = await issueService.linkIssue(context, projectId, issueId, body);

    return jsonResponse({ link }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
