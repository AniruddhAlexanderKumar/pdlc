import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/** GET — the options that were considered and not chosen. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const alternatives = await decisionService.listAlternatives(context, projectId, decisionId);
    return jsonResponse({ alternatives });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — record another alternative that was considered. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const alternative = await decisionService.addAlternative(context, projectId, decisionId, body);
    return jsonResponse({ alternative }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
