import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/requirements
 *
 * Requirements in the project, ordered by identifier. Optional `?status=`
 * filter. The project is verified to belong to the session's organization
 * before anything is read.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const requirements = await requirementService.listRequirements(context, projectId, {
      status: status ?? undefined,
    });

    return jsonResponse({ requirements });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/projects/[projectId]/requirements — create a DRAFT requirement. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const requirement = await requirementService.createRequirement(context, projectId, body);

    return jsonResponse({ requirement }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
