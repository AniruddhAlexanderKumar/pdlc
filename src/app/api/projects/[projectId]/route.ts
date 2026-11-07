import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as projectService from "@/server/services/project.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]
 *
 * Returns 404 for a project belonging to another organization — the same
 * response as one that does not exist, so the API never reveals records
 * outside the caller's tenancy.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const project = await projectService.getProject(context, projectId);
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/projects/[projectId] — update name and/or description. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const project = await projectService.updateProject(context, projectId, body);
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
