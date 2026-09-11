import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { engineeringGraphService } from "@/server/services/engineering-graph.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; nodeType: string; nodeId: string }>;
}

/**
 * GET — resolve one graph node.
 *
 * The node type comes from the path rather than being inferred from the id,
 * because ids are unique per table and not globally: without the type the
 * server would have to guess which table to look in, and a wrong guess is a
 * cross-artifact information leak.
 *
 * An unknown type, a node in another project, and a node in another
 * organization all produce the same 404.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, nodeType, nodeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const node = await engineeringGraphService.getNode(context, projectId, {
      type: nodeType,
      id: nodeId,
    });

    return jsonResponse({ node });
  } catch (error) {
    return errorResponse(error);
  }
}
