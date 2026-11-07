import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; evidenceId: string }>;
}

/**
 * GET /api/projects/[projectId]/evidence/[evidenceId]
 *
 * The evidence with its recorder/validator/successor, traceability, findings
 * that cite it, legal next transitions, editability flags and audit history.
 * Evidence in another organization's project returns 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const evidence = await evidenceService.getEvidence(context, projectId, evidenceId);

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — content fields only, and only while DRAFT.
 *
 * Status is not accepted here: lifecycle changes go through /validate and
 * /supersede so they are checked against the transition table.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await evidenceService.updateEvidence(context, projectId, evidenceId, body);

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}
