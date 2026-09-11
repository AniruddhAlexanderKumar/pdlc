import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as verificationService from "@/server/services/verification-activity.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * POST — the only way an activity's status changes.
 *
 * Validated against the lifecycle: PLANNED → IN_PROGRESS → PASSED/FAILED,
 * with WAIVED available while still open. Outcomes are terminal, so an
 * attempt to rewrite one (FAILED → PASSED) is a 409.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const verificationActivity = await verificationService.transitionVerificationStatus(
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
