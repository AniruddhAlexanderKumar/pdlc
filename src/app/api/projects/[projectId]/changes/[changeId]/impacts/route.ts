import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as changeService from "@/server/services/change-request.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string }>;
}

/**
 * GET — what this change *declares* it affects.
 *
 * These are assertions made by an engineer, not a computed affected set. The
 * system has not traversed anything to produce them.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const impacts = await changeService.listDeclaredImpacts(context, projectId, changeId);

    return jsonResponse({ impacts });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — declare that this change affects an artifact.
 *
 * The target is a typed `{ type, id }` pair and is checked against the change's
 * own project before anything is written; an artifact from elsewhere is
 * rejected.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const impacts = await changeService.addDeclaredImpact(context, projectId, changeId, body);

    return jsonResponse({ impacts }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
