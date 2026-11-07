import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as quickActionsService from "@/server/services/quick-actions.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/verification-activities/plan — the
 * requirements that have no check yet: what a plan would cover.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const requirements = await quickActionsService.listRequirementsNeedingChecks(context, projectId);

    return jsonResponse({ requirements });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/projects/[projectId]/verification-activities/plan — plan one
 * check per requirement and link it: `{ method, requirementIds? }`. Without
 * `requirementIds`, every requirement that has no check yet.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const checks = await quickActionsService.planChecks(context, projectId, body);

    return jsonResponse({ checks }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
