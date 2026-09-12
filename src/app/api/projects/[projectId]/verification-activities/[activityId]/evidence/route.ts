import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as verificationService from "@/server/services/verification-activity.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; activityId: string }>;
}

/**
 * Verification activity ↔ Evidence.
 *
 * Attaches an *existing* Evidence record — this is not a document store and
 * uploads nothing, mirroring the supplier-qualification evidence endpoint.
 * The evidence is validated against the same project before anything is
 * written.
 */

/** POST — attach an evidence record to this verification activity. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await verificationService.linkVerificationEvidence(
      context,
      projectId,
      activityId,
      body,
    );

    return jsonResponse({ evidence }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — detach one evidence record. The body identifies which. */
export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, activityId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await verificationService.unlinkVerificationEvidence(
      context,
      projectId,
      activityId,
      body,
    );

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}
