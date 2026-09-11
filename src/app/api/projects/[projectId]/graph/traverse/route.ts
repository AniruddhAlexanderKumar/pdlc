import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { engineeringGraphService } from "@/server/services/engineering-graph.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST — breadth-first traversal from a root node.
 *
 * POST rather than GET because the request is a structured object — a typed
 * root reference plus optional node-type and edge-type filters — and encoding
 * that in a query string would mean inventing a serialisation for it. Nothing
 * is written; this is a read.
 *
 * Body: `{ root: { type, id }, direction?, maxDepth?, maxNodes?, maxEdges?,
 * nodeTypes?, edgeTypes? }`. The limits are validated against the caps in
 * `GRAPH_LIMITS`; a request that asks for more than the cap is rejected rather
 * than quietly clamped, so a caller is never told it got a full answer when the
 * server decided otherwise.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const result = await engineeringGraphService.traverse(context, projectId, body);

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
