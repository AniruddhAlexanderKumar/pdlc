import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationFindingService } from "@/server/services/certification-finding.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string; findingId: string }>;
}

/**
 * POST — accepts a certification finding without resolving the underlying
 * condition: `{note, evidenceId?}`. Distinct from resolve, so the record
 * shows whether the concern was fixed or knowingly accepted.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId, findingId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const finding = await certificationFindingService.acceptFinding(
      context,
      projectId,
      itemId,
      findingId,
      body,
    );
    return jsonResponse({ finding });
  } catch (error) {
    return errorResponse(error);
  }
}
