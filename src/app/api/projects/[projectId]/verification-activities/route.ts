import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as verificationService from "@/server/services/verification-activity.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — verification activities in the project, ordered by identifier. Optional `?status=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const verificationActivities = await verificationService.listVerificationActivities(
      context,
      projectId,
      { status: status ?? undefined },
    );

    return jsonResponse({ verificationActivities });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — create a PLANNED verification activity. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const verificationActivity = await verificationService.createVerificationActivity(
      context,
      projectId,
      body,
    );

    return jsonResponse({ verificationActivity }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
