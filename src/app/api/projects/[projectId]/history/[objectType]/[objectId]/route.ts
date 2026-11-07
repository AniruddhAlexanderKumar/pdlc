import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as engineeringHistoryService from "@/server/services/engineering-history.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; objectType: string; objectId: string }>;
}

/**
 * GET /api/projects/[projectId]/history/[objectType]/[objectId]
 *
 * One object's real history: its own `AuditLog` trail plus — for a change
 * request, a baseline, or a verification activity — the real, already-
 * persisted assessment history genuinely about that object (impact
 * analyses, drift assessments, verification readiness assessments
 * respectively).
 *
 * `objectType` is validated against a fixed, typed enumeration
 * (`historyObjectTypeSchema`) — never an arbitrary table or Prisma model
 * name accepted from the client. An unsupported type is a 400, and an
 * object outside this project is a 404, identical to every other
 * project-scoped read in this codebase.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, objectType, objectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const result = await engineeringHistoryService.getObjectHistory(
      context,
      projectId,
      objectType,
      objectId,
      {
        offset: params.get("offset") ?? undefined,
        limit: params.get("limit") ?? undefined,
      },
    );

    return jsonResponse({ history: result });
  } catch (error) {
    return errorResponse(error);
  }
}
