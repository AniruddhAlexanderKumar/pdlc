import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as qualificationService from "@/server/services/supplier-qualification.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; qualificationId: string }>;
}

/**
 * Qualification ↔ Evidence.
 *
 * Attaches an *existing* Evidence record. This is not a document store and
 * uploads nothing: the qualification's own `evidenceReference` holds an external
 * locator, and this endpoint links the real Evidence records the project already
 * has. The evidence is validated against the same project before anything is
 * written.
 */

/** POST — attach an evidence record to this qualification. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, qualificationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await qualificationService.linkQualificationEvidence(
      context,
      projectId,
      qualificationId,
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
    const { projectId, qualificationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const evidence = await qualificationService.unlinkQualificationEvidence(
      context,
      projectId,
      qualificationId,
      body,
    );

    return jsonResponse({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}
