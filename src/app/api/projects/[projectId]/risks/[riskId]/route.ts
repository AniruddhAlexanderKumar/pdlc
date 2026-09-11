import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; riskId: string }>;
}

/**
 * GET /api/projects/[projectId]/risks/[riskId]
 *
 * The risk with its owner, traceability, legal next transitions, editability
 * flags and audit history. A risk in another organization's project returns
 * 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const risk = await riskService.getRisk(context, projectId, riskId);

    return jsonResponse({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — content fields only.
 *
 * Status is not accepted here: lifecycle changes go through /transition so
 * they are checked against the transition table.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const risk = await riskService.updateRisk(context, projectId, riskId, body);

    return jsonResponse({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}
