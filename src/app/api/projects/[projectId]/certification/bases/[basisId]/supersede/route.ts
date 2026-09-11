import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationBasisService } from "@/server/services/certification-basis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; basisId: string }>;
}

/** POST — marks an ACTIVE basis SUPERSEDED by a named replacement basis. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, basisId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const basis = await certificationBasisService.supersedeBasis(context, projectId, basisId, body);
    return jsonResponse({ basis });
  } catch (error) {
    return errorResponse(error);
  }
}
