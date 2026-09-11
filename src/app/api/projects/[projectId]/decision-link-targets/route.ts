import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/decision-link-targets
 *
 * Read-only lookup populating the decision traceability selectors:
 * requirements, design items, risks, issues and evidence in this project.
 * Evidence has no module yet, so that list is normally empty rather than
 * fabricated; risks and issues are real, project-scoped rows once created.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const targets = await decisionService.listDecisionLinkTargets(context, projectId);
    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
