import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationReviewService } from "@/server/services/certification-review.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; reviewId: string }>;
}

/**
 * GET — one historical certification review, exactly as it was recorded,
 * with its freshness against the present computed alongside. A historical
 * review is never re-judged under today's state.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, reviewId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const report = await certificationReviewService.explainCertificationReview(
      context,
      projectId,
      reviewId,
    );
    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
