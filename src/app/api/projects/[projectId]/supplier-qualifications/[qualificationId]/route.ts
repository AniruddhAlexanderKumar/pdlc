import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as qualificationService from "@/server/services/supplier-qualification.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; qualificationId: string }>;
}

/** GET — one qualification with its parents, attached evidence and history. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, qualificationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const qualification = await qualificationService.getSupplierQualification(
      context,
      projectId,
      qualificationId,
    );

    return jsonResponse({ qualification });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — update a qualification, including its status.
 *
 * The status is editable here because moving a qualification to EXPIRED or
 * WITHDRAWN is exactly the engineering judgement this system will not make on
 * anyone's behalf. Neither parent is editable: a qualification is *about* a
 * particular supplier and item, so moving it would change what it asserts.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, qualificationId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const qualification = await qualificationService.updateSupplierQualification(
      context,
      projectId,
      qualificationId,
      body,
    );

    return jsonResponse({ qualification });
  } catch (error) {
    return errorResponse(error);
  }
}
