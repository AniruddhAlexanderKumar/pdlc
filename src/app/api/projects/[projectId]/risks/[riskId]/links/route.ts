import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; riskId: string }>;
}

/** GET — every trace edge on the risk, with enough of each target to display it. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const links = await riskService.listRiskLinks(context, projectId, riskId);

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — links this risk to a real requirement, design item or engineering
 * decision: `{relation, targetId, note?}`. The target is re-resolved inside
 * this project, so an id from another project cannot be linked.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const link = await riskService.linkRisk(context, projectId, riskId, body);

    return jsonResponse({ link }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
