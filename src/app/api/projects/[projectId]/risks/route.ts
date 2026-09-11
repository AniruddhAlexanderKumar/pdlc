import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as riskService from "@/server/services/risk.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/risks
 *
 * Risks in the project, ordered by identifier. Optional `?status=` filter.
 * The project is verified to belong to the session's organization before
 * anything is read.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const risks = await riskService.listRisks(context, projectId, { status: status ?? undefined });

    return jsonResponse({ risks });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/projects/[projectId]/risks — create an OPEN risk. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const risk = await riskService.createRisk(context, projectId, body);

    return jsonResponse({ risk }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
