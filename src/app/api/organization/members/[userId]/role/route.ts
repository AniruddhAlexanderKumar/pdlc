import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as organizationMembershipService from "@/server/services/organization-membership.service";

export const dynamic = "force-dynamic";

/**
 * PATCH — set one member's organization role. Organization owner only, and
 * only to a role an owner may actually assign (`EXECUTIVE` or `MEMBER`);
 * `OWNER` is rejected by the request schema rather than silently dropped.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const context = await requireAuthenticatedContext();
    const { userId } = await params;
    const body = await readJsonBody(request);

    const member = await organizationMembershipService.setOrganizationMemberRole(
      context,
      userId,
      body,
    );

    return jsonResponse({ member });
  } catch (error) {
    return errorResponse(error);
  }
}
