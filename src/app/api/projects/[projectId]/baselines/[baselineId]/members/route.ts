import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { driftDetectionService } from "@/server/services/drift-detection.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; baselineId: string }>;
}

/** GET — the objects this baseline represents, with their snapshots. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const members = await driftDetectionService.listBaselineMembers(
      context,
      projectId,
      baselineId,
    );

    return jsonResponse({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — add one engineering object to a DRAFT baseline.
 *
 * The body carries a `nodeType` from a fixed list and an id, both validated
 * against the project before anything is written — there is no free-form entity
 * reference, and an id belonging to another project simply does not resolve.
 *
 * The object's state is snapshotted here, at this moment. That is what makes
 * "what exactly did we baseline?" answerable later, and why membership closes at
 * activation: a member added afterwards would carry a snapshot from a different
 * moment than its siblings, and the baseline would no longer describe one
 * coherent state.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, baselineId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const member = await driftDetectionService.addBaselineMember(
      context,
      projectId,
      baselineId,
      body,
    );

    return jsonResponse({ member }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
