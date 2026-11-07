import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/**
 * GET — the full decision memory: owner, alternatives, assumptions,
 * expectation, traceability, legal transitions and audit history. A decision
 * in another organization's project returns 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const decision = await decisionService.getDecision(context, projectId, decisionId);

    return jsonResponse({ decision });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — content only. Status moves through /transition. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const decision = await decisionService.updateDecision(context, projectId, decisionId, body);

    return jsonResponse({ decision });
  } catch (error) {
    return errorResponse(error);
  }
}
