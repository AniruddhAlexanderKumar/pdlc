import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationReviewService } from "@/server/services/certification-review.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — the certification review history, newest first. Nothing is ever overwritten. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const reviews = await certificationReviewService.listCertificationReviewHistory(context, projectId);
    return jsonResponse({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — evaluates the internal certification review and appends an
 * immutable record. Never triggered automatically — a review is a claim
 * about a moment, and it is always an explicit action.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const report = await certificationReviewService.evaluateCertificationReview(context, projectId, body);
    return jsonResponse({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
