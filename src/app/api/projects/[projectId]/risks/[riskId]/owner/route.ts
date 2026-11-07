import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; riskId: string }>;
}

/**
 * POST /api/projects/[projectId]/risks/[riskId]/owner
 *
 * Assigns an owner, or clears one with `{ ownerId: null }`. The owner must be
 * a member of the session's organization — an id from anywhere else is
 * rejected rather than stored.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const risk = await riskService.assignRiskOwner(context, projectId, riskId, body);

    return jsonResponse({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}
