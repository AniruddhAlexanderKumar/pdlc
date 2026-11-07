import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { technicalReadinessService } from "@/server/services/technical-readiness.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the most recent assessment of one gate, with freshness derived at read
 * time.
 *
 * Reading never evaluates. When the gate's scope has moved the response says
 * STALE and returns the assessment exactly as it was written, so the interface
 * can offer a re-evaluation rather than quietly performing one.
 *
 * Returns a `NOT_EVALUATED` shape when the gate has never been assessed: zero
 * findings would read as "we checked and found nothing wrong", which is a much
 * stronger claim than "nobody has assessed this gate".
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const gate = new URL(request.url).searchParams.get("gate");

    const latest = await technicalReadinessService.getLatestTechnicalReadiness(
      context,
      projectId,
      gate,
    );

    return jsonResponse({ latest });
  } catch (error) {
    return errorResponse(error);
  }
}
