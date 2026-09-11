import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { verificationReadinessService } from "@/server/services/verification-readiness.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * POST — evaluate readiness and record the result.
 *
 * Explicit by design: nothing evaluates on a page load. An assessment is a
 * claim about a moment, and silently re-running it would make "when was this
 * judged, and against what?" unanswerable.
 *
 * The project and the activity come from the path; the actor from the session.
 * The body carries nothing — every rule outcome is derived from recorded state,
 * so there is no readiness verdict a client could supply.
 *
 * Each evaluation creates a new immutable assessment; none replaces its
 * predecessor.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request).catch(() => ({}));

    const report = await verificationReadinessService.evaluateVerificationReadiness(
      context,
      projectId,
      activityId,
      body ?? {},
    );

    return jsonResponse({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET — every assessment recorded for this activity, newest first. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const assessments = await verificationReadinessService.listVerificationReadinessHistory(
      context,
      projectId,
      activityId,
    );

    return jsonResponse({ assessments });
  } catch (error) {
    return errorResponse(error);
  }
}
