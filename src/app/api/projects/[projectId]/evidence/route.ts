import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as evidenceService from "@/server/services/evidence.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/evidence
 *
 * Evidence in the project, ordered by identifier. Optional `?status=` and
 * `?evidenceType=` filters. The project is verified to belong to the
 * session's organization before anything is read.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const evidence = await evidenceService.listEvidence(context, projectId, {
      status: params.get("status") ?? undefined,
      evidenceType: params.get("evidenceType") ?? undefined,
    });

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/projects/[projectId]/evidence — record a new, DRAFT piece of evidence. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await evidenceService.createEvidence(context, projectId, body);

    return jsonResponse({ evidence }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
