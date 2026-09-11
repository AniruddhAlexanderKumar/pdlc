import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; alternativeId: string }>;
}

/** PATCH — revise a recorded alternative. Scoped to its own decision. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, alternativeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const alternative = await decisionService.updateAlternative(
      context,
      projectId,
      decisionId,
      alternativeId,
      body,
    );

    return jsonResponse({ alternative });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — remove an alternative from the decision's record. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, alternativeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await decisionService.removeAlternative(context, projectId, decisionId, alternativeId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
