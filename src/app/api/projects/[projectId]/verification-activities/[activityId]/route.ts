import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as verificationService from "@/server/services/verification-activity.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * GET — the activity with its owner, verified requirements, any attached
 * evidence, legal next transitions and audit history.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const verificationActivity = await verificationService.getVerificationActivity(
      context,
      projectId,
      activityId,
    );

    return jsonResponse({ verificationActivity });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — plan fields only. Status moves through /transition, and the
 * completion stamp is set by the transition that concludes the activity.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const verificationActivity = await verificationService.updateVerificationActivity(
      context,
      projectId,
      activityId,
      body,
    );

    return jsonResponse({ verificationActivity });
  } catch (error) {
    return errorResponse(error);
  }
}
