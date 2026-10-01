import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as quickActionsService from "@/server/services/quick-actions.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/requirements/bulk — add several draft
 * requirements at once from `{ statements: string[] }`, each numbered and
 * titled automatically. All are added or none are.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const requirements = await quickActionsService.createRequirementsInBulk(context, projectId, body);

    return jsonResponse({ requirements }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
