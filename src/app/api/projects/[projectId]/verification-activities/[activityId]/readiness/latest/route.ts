import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { verificationReadinessService } from "@/server/services/verification-readiness.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * GET — the most recent assessment, with its freshness derived at read time.
 *
 * Reading never evaluates. When the basis has moved the response says STALE and
 * returns the assessment exactly as it was written, so the interface can offer
 * a re-evaluation rather than quietly performing one.
 *
 * Returns a `NOT_EVALUATED` shape when nothing has been run: zero findings
 * would read as "we checked and found nothing wrong", which is a much stronger
 * claim than "nobody has assessed this".
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const latest = await verificationReadinessService.getLatestVerificationReadiness(
      context,
      projectId,
      activityId,
    );

    return jsonResponse({ latest });
  } catch (error) {
    return errorResponse(error);
  }
}
