import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as userRepository from "@/server/repositories/user.repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/organization/members
 *
 * Members of the *session's* organization — the id is never taken from the
 * request. Returns id, name and email only; no credential, role internals or
 * organization id reach the browser. Exists solely to populate the requirement
 * owner selector.
 */
export async function GET() {
  try {
    const context = await requireAuthenticatedContext();
    const members = await userRepository.listOrganizationMembers(context.organizationId);

    return jsonResponse({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
