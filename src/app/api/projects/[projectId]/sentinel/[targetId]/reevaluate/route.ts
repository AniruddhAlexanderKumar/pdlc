import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; targetId: string }>;
}

/**
 * POST — the controlled reevaluation dispatch. Invokes the real engine for
 * this target's domain (`ChangeImpactAnalysisService`,
 * `AssumptionMonitoringService`, `VerificationReadinessService`,
 * `TechnicalReadinessService`, `DriftDetectionService`, or
 * `CertificationReviewService` — never a second calculation of its own) and,
 * on success, resolves the target automatically, since a fresh evaluation is
 * exactly the objective evidence the resolution policy accepts.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, targetId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const target = await decisionSentinelService.reEvaluateTarget(context, projectId, targetId, body);
    return jsonResponse({ target });
  } catch (error) {
    return errorResponse(error);
  }
}
