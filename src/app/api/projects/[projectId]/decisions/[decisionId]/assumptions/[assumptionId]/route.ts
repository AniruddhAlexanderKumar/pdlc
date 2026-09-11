import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string; assumptionId: string }>;
}

/** PATCH — revise an assumption, including recording that it was validated or invalidated. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const assumption = await decisionService.updateAssumption(
      context,
      projectId,
      decisionId,
      assumptionId,
      body,
    );

    return jsonResponse({ assumption });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — remove an assumption from the decision's record. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId, assumptionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await decisionService.removeAssumption(context, projectId, decisionId, assumptionId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
