import { graphDirectionSchema, graphEdgeTypeSchema } from "@/domain";
import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { engineeringGraphService } from "@/server/services/engineering-graph.service";
import { parseOrThrow } from "@/server/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; nodeType: string; nodeId: string }>;
}

/**
 * GET — the direct connections of one node.
 *
 * Query parameters:
 *   `direction`  OUTBOUND | INBOUND | BOTH (default BOTH)
 *   `edgeType`   repeatable; restricts which relationship types are followed
 *
 * This is one hop only. Anything deeper goes through the traverse endpoint,
 * where the depth and size caps apply.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, nodeType, nodeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const params = new URL(request.url).searchParams;
    const direction = parseOrThrow(
      graphDirectionSchema.default("BOTH"),
      params.get("direction") ?? undefined,
      "Invalid direction",
    );
    const requestedEdgeTypes = params.getAll("edgeType");
    const edgeTypes =
      requestedEdgeTypes.length > 0
        ? parseOrThrow(graphEdgeTypeSchema.array(), requestedEdgeTypes, "Invalid edge type")
        : undefined;

    const neighborhood = await engineeringGraphService.getDirectConnections(
      context,
      projectId,
      { type: nodeType, id: nodeId },
      direction,
      edgeTypes,
    );

    return jsonResponse(neighborhood);
  } catch (error) {
    return errorResponse(error);
  }
}
