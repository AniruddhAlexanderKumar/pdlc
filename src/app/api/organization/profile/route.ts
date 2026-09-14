import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as organizationService from "@/server/services/organization.service";

export const dynamic = "force-dynamic";

/** GET — the organization's profile (currently: its industry). Any authenticated member may read. */
export async function GET() {
  try {
    const context = await requireAuthenticatedContext();
    const profile = await organizationService.getOrganizationProfile(context);
    return jsonResponse({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — set or change the organization's industry. Organization owner only. */
export async function PATCH(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const profile = await organizationService.setOrganizationIndustry(context, body);

    return jsonResponse({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
