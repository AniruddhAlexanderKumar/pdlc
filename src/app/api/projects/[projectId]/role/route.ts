import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as membershipService from "@/server/services/project-membership.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — the caller's own effective access to this project: their project
 * role, and whether they administer the organization.
 *
 * A convenience read for the UI to decide what to show and enable — never
 * itself an authorization boundary. Every mutation route re-derives access
 * from the session server-side regardless of what this returned.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const access = await membershipService.getMyAccess(context, projectId);

    return jsonResponse({ access });
  } catch (error) {
    return errorResponse(error);
  }
}
