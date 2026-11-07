import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as supplierService from "@/server/services/supplier.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; supplierId: string }>;
}

/**
 * GET — one supplier with the items it provides, its qualifications and its
 * audit history.
 *
 * Project-scoped, so a supplier id guessed from another project — or another
 * organization — is simply not found rather than refused.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, supplierId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const supplier = await supplierService.getSupplier(context, projectId, supplierId);

    return jsonResponse({ supplier });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — update a supplier's name, description or status.
 *
 * The identifier is not updatable in any state, which is why no update contract
 * carries it. Changing a supplier's status never touches its qualifications:
 * those are separate engineering judgements.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, supplierId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const supplier = await supplierService.updateSupplier(context, projectId, supplierId, body);

    return jsonResponse({ supplier });
  } catch (error) {
    return errorResponse(error);
  }
}
