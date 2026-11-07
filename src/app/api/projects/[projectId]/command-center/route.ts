import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { getCommandCenter } from "@/server/services/project-command-center.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/command-center
 *
 * The Engineering Command Center: one project's real state, composed from
 * every engine that already produces one — read-only, and nothing here
 * triggers evaluation, detection, or any other mutation. A project in
 * another organization 404s, the same as every other project-scoped route.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const commandCenter = await getCommandCenter(context, projectId);

    return jsonResponse({ commandCenter });
  } catch (error) {
    return errorResponse(error);
  }
}
