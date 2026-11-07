import { graphEdgeTypeSchema } from "@/domain";
import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { engineeringGraphService } from "@/server/services/engineering-graph.service";
import { parseOrThrow } from "@/server/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — report structural anomalies in the project's relationships.
 *
 * Read-only, and deliberately so: it reports what is wrong and repairs nothing.
 * A 200 with a non-empty `anomalies` array is a successful check that found
 * problems, not a failed request.
 *
 * Optional repeatable `edgeType` narrows the scan; omitting it checks all 22.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const requestedEdgeTypes = new URL(request.url).searchParams.getAll("edgeType");
    const edgeTypes =
      requestedEdgeTypes.length > 0
        ? parseOrThrow(graphEdgeTypeSchema.array(), requestedEdgeTypes, "Invalid edge type")
        : undefined;

    const report = await engineeringGraphService.checkConsistency(context, projectId, edgeTypes);

    return jsonResponse({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
