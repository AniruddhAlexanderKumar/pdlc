import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { listSelectableRoots } from "@/server/services/traceability.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — objects of one type that can be opened as a traceability root.
 *
 * Query parameter `type` is one of `TRACEABILITY_SELECTABLE_NODE_TYPES`. This
 * populates the workspace's own object picker only; it is not a general
 * listing API for every module, and it is not the graph itself — inspecting
 * relationships and traversing from a root both go through the existing
 * `/graph/node/...` and `/graph/traverse` endpoints unchanged.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const type = new URL(request.url).searchParams.get("type");
    const objects = await listSelectableRoots(context, projectId, type);

    return jsonResponse({ objects });
  } catch (error) {
    return errorResponse(error);
  }
}
