import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationBasisService } from "@/server/services/certification-basis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — every certification basis tracked under this project's programme. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const bases = await certificationBasisService.listBases(context, projectId);
    return jsonResponse({ bases });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — records a new certification basis (DRAFT until activated). */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const basis = await certificationBasisService.createBasis(context, projectId, body);
    return jsonResponse({ basis }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
