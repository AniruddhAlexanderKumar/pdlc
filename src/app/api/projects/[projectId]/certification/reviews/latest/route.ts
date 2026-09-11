import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationReviewService } from "@/server/services/certification-review.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the most recent internal certification review, with freshness
 * derived at read time. A distinct `NOT_EVALUATED` shape when nothing has
 * ever been run — zero findings would read as "we checked and found
 * nothing", a far stronger claim than "nobody has evaluated this".
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const report = await certificationReviewService.getLatestCertificationReview(context, projectId);
    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
