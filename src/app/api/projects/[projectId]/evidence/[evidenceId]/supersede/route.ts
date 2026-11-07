import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; evidenceId: string }>;
}

/**
 * POST /api/projects/[projectId]/evidence/[evidenceId]/supersede
 *
 * DRAFT|VALIDATED -> SUPERSEDED. Body: `{ newEvidenceId, rationale? }` — the
 * replacement must already exist as its own real evidence record in this
 * project. No historical `EvidenceLink` row is touched.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await evidenceService.supersedeEvidence(context, projectId, evidenceId, body);

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}
