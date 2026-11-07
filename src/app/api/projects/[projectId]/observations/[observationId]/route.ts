import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; observationId: string }>;
}

/** GET — one observation, project-scoped. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, observationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const observation = await driftDetectionService.getObservation(
      context,
      projectId,
      observationId,
    );

    return jsonResponse({ observation });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — correct a RECORDED observation.
 *
 * Refused once it is REVIEWED or REJECTED: editing then would rewrite evidence
 * an engineer has already made a determination about. Correcting a typo before
 * anyone has relied on it is ordinary work; forcing a new record for every fix
 * would bury the real history in noise.
 *
 * The subject and identifier are absent from the contract — re-pointing an
 * observation at a different object would change what it asserts rather than
 * correct it, so a new observation is recorded instead.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, observationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const observation = await driftDetectionService.updateObservation(
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
