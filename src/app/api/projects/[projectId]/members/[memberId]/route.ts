import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as membershipService from "@/server/services/project-membership.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; memberId: string }>;
}

/** PATCH — change a member's project role. Manager (or organization owner) only. */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, memberId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const member = await membershipService.changeMemberRole(context, projectId, memberId, body);

    return jsonResponse({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — remove a member's project access. Manager (or organization owner) only. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, memberId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await membershipService.removeMember(context, projectId, memberId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
