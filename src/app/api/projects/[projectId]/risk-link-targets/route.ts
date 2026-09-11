import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/risk-link-targets
 *
 * Read-only lookup populating the risk traceability selector: requirements,
 * design items and engineering decisions in this project.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const targets = await riskService.listLinkTargets(context, projectId);
    return jsonResponse({ targets });
  } catch (error) {
    return errorResponse(error);
  }
}
