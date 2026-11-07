import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationBasisService } from "@/server/services/certification-basis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; basisId: string }>;
}

/** GET — one certification basis. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, basisId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const basis = await certificationBasisService.getBasis(context, projectId, basisId);
    return jsonResponse({ basis });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — edits a certification basis while it is DRAFT.
 *
 * Once ACTIVE or SUPERSEDED, the basis record is immutable — refused rather
 * than silently ignored, so a compliance item's tracked-against basis can
 * never move underneath it.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, basisId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const basis = await certificationBasisService.updateBasis(context, projectId, basisId, body);
    return jsonResponse({ basis });
  } catch (error) {
    return errorResponse(error);
  }
}
