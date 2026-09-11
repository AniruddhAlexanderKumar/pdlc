import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as needService from "@/server/services/stakeholder-need.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — stakeholder needs in the project, ordered by identifier. Optional `?status=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const stakeholderNeeds = await needService.listStakeholderNeeds(context, projectId, {
      status: status ?? undefined,
    });

    return jsonResponse({ stakeholderNeeds });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — create a stakeholder need in the project. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const stakeholderNeed = await needService.createStakeholderNeed(context, projectId, body);

    return jsonResponse({ stakeholderNeed }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
