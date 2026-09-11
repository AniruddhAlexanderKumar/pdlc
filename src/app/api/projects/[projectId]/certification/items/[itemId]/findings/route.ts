import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationFindingService } from "@/server/services/certification-finding.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string }>;
}

/** GET — every certification finding recorded against this compliance item. Nothing is ever deleted. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const findings = await certificationFindingService.listFindings(context, projectId, itemId);
    return jsonResponse({ findings });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — records a new certification/compliance finding against this item. Severity is explicit, never a score. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const finding = await certificationFindingService.createFinding(context, projectId, itemId, body);
    return jsonResponse({ finding }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
