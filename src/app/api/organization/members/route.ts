import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as organizationMembershipService from "@/server/services/organization-membership.service";

export const dynamic = "force-dynamic";

/** GET — every user in the caller's organization. Any authenticated member may read (for project-member pickers). */
export async function GET() {
  try {
    const context = await requireAuthenticatedContext();
    const members = await organizationMembershipService.listOrganizationMembers(context);
    return jsonResponse({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — provision a new user account inside the caller's own organization. Organization owner only. */
export async function POST(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const member = await organizationMembershipService.addOrganizationMember(context, body);

    return jsonResponse({ member }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
