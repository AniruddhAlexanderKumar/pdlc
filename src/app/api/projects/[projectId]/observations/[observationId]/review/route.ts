import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; observationId: string }>;
}

/**
 * POST — an engineer accepts this observation as a record of what happened.
 *
 * This is the gate that turns somebody's report into something the drift engine
 * will compare against. It also closes the record: from here the substance is
 * fixed, because a determination has been made about it.
 *
 * Reviewing says the observation is an accurate record. It does not say the
 * thing observed is acceptable — that judgement is what drift findings hand back
 * to a person.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, observationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const observation = await driftDetectionService.reviewObservation(
      context,
      projectId,
      observationId,
      body,
    );

    return jsonResponse({ observation });
  } catch (error) {
    return errorResponse(error);
  }
}
