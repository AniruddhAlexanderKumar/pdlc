import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; riskId: string }>;
}

/**
 * POST /api/projects/[projectId]/risks/[riskId]/transition
 *
 * The only way a risk's status changes. Takes `{ to, rationale? }` and
 * validates it against the lifecycle table; an illegal move (e.g.
 * `MITIGATED → OPEN`, or anything out of `CLOSED`) is a 409 naming what would
 * have been allowed.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, riskId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const risk = await riskService.transitionRisk(context, projectId, riskId, body);

    return jsonResponse({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}
