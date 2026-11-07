import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as projectService from "@/server/services/project.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/archive
 *
 * A state transition, not a delete: the project is retained and marked
 * ARCHIVED. Archiving an already-archived project is a 409 rather than a
 * silent no-op, so the audit trail never gains a duplicate event.
 */
export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const project = await projectService.archiveProject(context, projectId);
    return jsonResponse({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
