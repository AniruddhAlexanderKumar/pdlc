import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; observationId: string }>;
}

/**
 * POST — an engineer does not accept this observation.
 *
 * The record is kept, not deleted: that somebody reported this, and that it was
 * rejected, is itself part of the operational history. A rejected observation is
 * never compared, and the drift engine says so rather than letting its absence
 * pass unremarked.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, observationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const observation = await driftDetectionService.rejectObservation(
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
