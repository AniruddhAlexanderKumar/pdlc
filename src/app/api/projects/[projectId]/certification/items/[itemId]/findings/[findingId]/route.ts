import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationFindingService } from "@/server/services/certification-finding.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; itemId: string; findingId: string }>;
}

/** PATCH — edits an OPEN or IN_PROGRESS finding's title/description/severity/status. Refused once RESOLVED/ACCEPTED. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, itemId, findingId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const finding = await certificationFindingService.updateFinding(
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
