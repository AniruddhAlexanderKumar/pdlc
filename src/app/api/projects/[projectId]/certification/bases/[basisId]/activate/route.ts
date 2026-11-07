import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationBasisService } from "@/server/services/certification-basis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; basisId: string }>;
}

/**
 * POST — fixes this basis as the certification standard compliance items are
 * tracked against. Refused if another basis is already ACTIVE unless the
 * body carries `supersedeActive: true` — nothing replaces the active basis
 * silently.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, basisId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const basis = await certificationBasisService.activateBasis(context, projectId, basisId, body);
    return jsonResponse({ basis });
  } catch (error) {
    return errorResponse(error);
  }
}
