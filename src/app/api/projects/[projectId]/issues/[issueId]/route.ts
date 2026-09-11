import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; issueId: string }>;
}

/**
 * GET /api/projects/[projectId]/issues/[issueId]
 *
 * The issue with its owner, traceability, legal next transitions,
 * editability flags and audit history. An issue in another organization's
 * project returns 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const issue = await issueService.getIssue(context, projectId, issueId);

    return jsonResponse({ issue });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — content fields only.
 *
 * Status is not accepted here: lifecycle changes go through /transition so
 * they are checked against the transition table.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, issueId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const issue = await issueService.updateIssue(context, projectId, issueId, body);

    return jsonResponse({ issue });
  } catch (error) {
    return errorResponse(error);
  }
}
