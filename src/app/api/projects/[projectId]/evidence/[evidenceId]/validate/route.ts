import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; evidenceId: string }>;
}

/**
 * POST /api/projects/[projectId]/evidence/[evidenceId]/validate
 *
 * DRAFT -> VALIDATED, the only way evidence is asserted sound. Freezes its
 * content from here on; an illegal call (already VALIDATED, or SUPERSEDED)
 * is a 409.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await evidenceService.validateEvidence(context, projectId, evidenceId, body);

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}
