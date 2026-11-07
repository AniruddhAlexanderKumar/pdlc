import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the most recent drift assessment, with freshness derived at read time.
 *
 * `?baselineId=` narrows it to one baseline.
 *
 * Reading never evaluates. When the drift basis has moved the response says
 * STALE and returns the assessment exactly as it was written, so the interface
 * can offer a re-evaluation rather than quietly performing one.
 *
 * Returns a `NOT_EVALUATED` shape when nothing has been run: zero findings would
 * read as "we compared everything and nothing has drifted", which is a far
 * stronger claim than "nobody has run this".
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const baselineId = new URL(request.url).searchParams.get("baselineId");

    const latest = await driftDetectionService.getLatestDriftAssessment(
      context,
      projectId,
      baselineId ?? undefined,
    );

    return jsonResponse({ latest });
  } catch (error) {
    return errorResponse(error);
  }
}
