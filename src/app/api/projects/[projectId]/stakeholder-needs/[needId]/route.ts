import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as needService from "@/server/services/stakeholder-need.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; needId: string }>;
}

/**
 * GET — the need with the requirements derived from it and its audit history.
 * A need in another organization's project returns 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, needId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const stakeholderNeed = await needService.getStakeholderNeed(context, projectId, needId);

    return jsonResponse({ stakeholderNeed });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — update title, description, stakeholder or status. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, needId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const stakeholderNeed = await needService.updateStakeholderNeed(
      context,
      projectId,
      needId,
      body,
    );

    return jsonResponse({ stakeholderNeed });
  } catch (error) {
    return errorResponse(error);
  }
}
