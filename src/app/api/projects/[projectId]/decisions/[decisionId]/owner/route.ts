import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/** POST — assign an owner, or clear one with `{ ownerId: null }`. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const decision = await decisionService.assignDecisionOwner(
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
