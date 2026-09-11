import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — decisions in the project, ordered by identifier. Optional `?status=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const decisions = await decisionService.listDecisions(context, projectId, {
      status: status ?? undefined,
    });

    return jsonResponse({ decisions });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — create a PROPOSED decision. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const decision = await decisionService.createDecision(context, projectId, body);

    return jsonResponse({ decision }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
