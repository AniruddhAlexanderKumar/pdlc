import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/link-targets
 *
 * Read-only lookup that populates the traceability selectors: the stakeholder
 * needs, design items, verification activities and engineering decisions that
 * exist in this project. Deliberately minimal — this is not the beginning of
 * those modules, just enough for a picker.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const targets = await requirementService.listLinkTargets(context, projectId);

    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
