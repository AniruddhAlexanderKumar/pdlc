import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; issueId: string }>;
}

/**
 * POST /api/projects/[projectId]/issues/[issueId]/transition
 *
 * The only way an issue's status changes. Takes `{ to, rationale? }` and
 * validates it against the lifecycle table; an illegal move (e.g.
 * `RESOLVED → IN_PROGRESS`, or anything out of `CLOSED`) is a 409 naming what
 * would have been allowed.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const issue = await issueService.transitionIssue(context, projectId, issueId, body);

    return jsonResponse({ issue });
  } catch (error) {
    return errorResponse(error);
  }
}
