import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/**
 * POST — the only way a decision's status changes. Validated against the
 * lifecycle table; an illegal jump is a 409 naming what was allowed.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const decision = await decisionService.transitionDecisionStatus(
      context,
      projectId,
      decisionId,
      body,
    );

    return jsonResponse({ decision });
  } catch (error) {
    return errorResponse(error);
  }
}
