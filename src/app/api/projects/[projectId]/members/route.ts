import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as membershipService from "@/server/services/project-membership.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — every member of the project. Any project member (or the organization owner) may read. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const members = await membershipService.listMembers(context, projectId);

    return jsonResponse({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — grant a real organization member access to this project. Manager (or organization owner) only. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const member = await membershipService.addMember(context, projectId, body);

    return jsonResponse({ member }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
