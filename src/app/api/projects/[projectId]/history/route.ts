import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as engineeringHistoryService from "@/server/services/engineering-history.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/history
 *
 * The project's chronological Engineering History stream, composed from
 * `AuditLog` and every engine's own already-persisted assessment/event
 * records — a read model, like the Command Center and Traceability before
 * it. Nothing here writes a row.
 *
 * Optional query filters: `?module=`, `?objectType=`, `?actorId=`, `?from=`,
 * `?to=` (ISO date strings) — narrowing only, never a table/model name.
 * Optional `?offset=`/`?limit=` for stable, bounded pagination; `limit` is
 * clamped server-side regardless of what a caller requests.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const result = await engineeringHistoryService.getProjectHistory(
      context,
      projectId,
      {
        module: params.get("module") ?? undefined,
        objectType: params.get("objectType") ?? undefined,
        actorId: params.get("actorId") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
      },
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
