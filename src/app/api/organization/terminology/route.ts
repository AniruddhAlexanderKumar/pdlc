import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as organizationService from "@/server/services/organization.service";

export const dynamic = "force-dynamic";

/**
 * PATCH — set or change the organization's terminology overrides. Organization
 * owner only. Reading terminology is part of `GET /api/organization/profile`,
 * not a separate endpoint — the sidebar and every module header need it on
 * every page, and a second round trip for a value that changes rarely and
 * costs nothing to include isn't worth the extra request.
 */
export async function PATCH(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const profile = await organizationService.setOrganizationTerminology(context, body);

    return jsonResponse({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
