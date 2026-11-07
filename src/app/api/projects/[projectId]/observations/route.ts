import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — operational observations, newest first. Optional `?status=`, `?observationType=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const observations = await driftDetectionService.listObservations(context, projectId, {
      status: params.get("status") ?? undefined,
      observationType: params.get("observationType") ?? undefined,
    });

    return jsonResponse({ observations });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — record something observed in operation.
 *
 * Created as RECORDED, which means somebody wrote down what they saw and
 * nothing more. It is deliberately not treated as established engineering
 * evidence until an engineer reviews it, and the drift engine compares only
 * reviewed observations.
 *
 * The subject, where one is given, is validated against this project. The
 * numeric value is an exact decimal string handed to a NUMERIC column — never
 * parsed to a float, in a system whose whole purpose is saying whether two
 * numbers differ.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const observation = await driftDetectionService.recordObservation(context, projectId, body);

    return jsonResponse({ observation }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
