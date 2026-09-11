import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { technicalReadinessService } from "@/server/services/technical-readiness.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST — evaluate one gate and record the result.
 *
 * Explicit by design: nothing evaluates on a page load, and nothing schedules
 * it. A gate assessment is a claim about a moment, and silently recomputing it
 * would make "when was this judged, and against what?" unanswerable.
 *
 * The body carries the gate and nothing else. The project comes from the path
 * and the actor from the session; rule selection belongs entirely to the
 * backend, and a client that tries to send a verdict, a rule, a finding, an
 * organization, an actor or a readiness version is rejected outright rather
 * than having the field quietly dropped.
 *
 * Each evaluation creates a new immutable assessment; none replaces its
 * predecessor.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const report = await technicalReadinessService.evaluateTechnicalReadiness(
      context,
      projectId,
      body,
    );

    return jsonResponse({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET — assessment history for this project, newest first.
 *
 * `?gate=` narrows it to one gate, which is normally what a reader wants: how
 * has *this* gate moved, rather than an interleaving of five different
 * questions. Omitting it returns every gate's history.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const gate = new URL(request.url).searchParams.get("gate");

    const assessments = await technicalReadinessService.listTechnicalReadinessHistory(
      context,
      projectId,
      gate ?? undefined,
    );

    return jsonResponse({ assessments });
  } catch (error) {
    return errorResponse(error);
  }
}
