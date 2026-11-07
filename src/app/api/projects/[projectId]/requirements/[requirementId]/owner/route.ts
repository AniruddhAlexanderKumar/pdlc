import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; requirementId: string }>;
}

/**
 * POST /api/projects/[projectId]/requirements/[requirementId]/owner
 *
 * Assigns an owner, or clears one with `{ ownerId: null }`. The owner must be
 * a member of the session's organization — an id from anywhere else is
 * rejected rather than stored.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const requirement = await requirementService.assignRequirementOwner(
      context,
      projectId,
      requirementId,
      body,
    );

    return jsonResponse({ requirement });
  } catch (error) {
    return errorResponse(error);
  }
}
