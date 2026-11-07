import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationFindingService } from "@/server/services/certification-finding.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string; findingId: string }>;
}

/**
 * POST — resolves a certification finding: `{note, evidenceId?}`.
 *
 * The note, the actor and the timestamp are all preserved — a finding never
 * silently disappears, and there is no delete on this resource.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId, findingId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const finding = await certificationFindingService.resolveFinding(
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
