import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as verificationService from "@/server/services/verification-activity.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * POST — assign an owner, or clear one with `{ ownerId: null }`.
 * The owner must be a member of the session's organization.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const verificationActivity = await verificationService.assignVerificationOwner(
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
