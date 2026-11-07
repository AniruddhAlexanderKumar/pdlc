import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — drift assessment history, newest first.
 *
 * `?baselineId=` narrows it to one baseline, which is normally what a reader
 * wants: how has drift against *this* basis moved, rather than an interleaving
 * of comparisons against different bases.
 *
 * Nothing is ever overwritten, so this is the full record of how the gap between
 * the approved basis and observed reality has changed over time.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const baselineId = new URL(request.url).searchParams.get("baselineId");

    const assessments = await driftDetectionService.listDriftHistory(
      context,
      projectId,
      baselineId ?? undefined,
    );

    return jsonResponse({ assessments });
  } catch (error) {
    return errorResponse(error);
  }
}
