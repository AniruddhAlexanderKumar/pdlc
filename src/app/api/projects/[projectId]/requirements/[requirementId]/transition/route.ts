import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; requirementId: string }>;
}

/**
 * POST /api/projects/[projectId]/requirements/[requirementId]/transition
 *
 * The only way a requirement's status changes. Takes `{ to, rationale? }` and
 * validates it against the lifecycle table; an illegal move (DRAFT → APPROVED,
 * anything out of OBSOLETE) is a 409 naming what would have been allowed.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const requirement = await requirementService.transitionRequirementStatus(
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
