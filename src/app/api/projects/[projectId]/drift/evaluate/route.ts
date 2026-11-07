import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST — compare current state against a baseline and record the result.
 *
 * Explicit by design: nothing evaluates on a page load, and nothing schedules
 * it. A drift assessment is a claim about a moment, and silently recomputing it
 * would make "when did this diverge, and from what?" unanswerable.
 *
 * The body carries a baseline id and nothing else. The project comes from the
 * path and the actor from the session; rule selection belongs entirely to the
 * backend, and a client that tries to send a verdict, a finding or a rule is
 * rejected outright rather than having the field quietly dropped.
 *
 * Each evaluation creates a new immutable assessment; none replaces its
 * predecessor, and none alters the baseline it compared against.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const report = await driftDetectionService.evaluateDrift(context, projectId, body);

    return jsonResponse({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
