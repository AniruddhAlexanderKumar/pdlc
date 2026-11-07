import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/** GET — what had to be true for this decision to remain sound. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const assumptions = await decisionService.listAssumptions(context, projectId, decisionId);
    return jsonResponse({ assumptions });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — record an assumption. Defaults to UNKNOWN: recording is not checking. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const assumption = await decisionService.addAssumption(context, projectId, decisionId, body);
    return jsonResponse({ assumption }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
