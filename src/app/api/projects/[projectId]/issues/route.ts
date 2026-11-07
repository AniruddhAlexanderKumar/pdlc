import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as issueService from "@/server/services/issue.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/issues
 *
 * Issues in the project, ordered by identifier. Optional `?status=` and
 * `?severity=` filters. The project is verified to belong to the session's
 * organization before anything is read.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const issues = await issueService.listIssues(context, projectId, {
      status: params.get("status") ?? undefined,
      severity: params.get("severity") ?? undefined,
    });

    return jsonResponse({ issues });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/projects/[projectId]/issues — create an OPEN issue. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const issue = await issueService.createIssue(context, projectId, body);

    return jsonResponse({ issue }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
