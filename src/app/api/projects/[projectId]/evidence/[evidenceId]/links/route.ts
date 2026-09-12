import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; evidenceId: string }>;
}

/** GET — every trace edge this evidence carries, with enough of each target to display it. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const links = await evidenceService.listEvidenceLinks(context, projectId, evidenceId);

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — links this evidence to a real requirement, decision, verification
 * activity, supplied item, supplier qualification or compliance item:
 * `{relation, targetId, note?}`. The target is re-resolved inside this
 * project, so an id from another project cannot be linked.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, evidenceId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const link = await evidenceService.linkEvidence(context, projectId, evidenceId, body);

    return jsonResponse({ link }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
