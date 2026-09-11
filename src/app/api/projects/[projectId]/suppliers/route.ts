import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as supplierService from "@/server/services/supplier.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — suppliers in the project, ordered by identifier. Optional `?status=`.
 *
 * The supplied-item and qualification counts come from a real aggregate in the
 * same query, so the list is one round trip rather than one per supplier.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const status = new URL(request.url).searchParams.get("status");

    const suppliers = await supplierService.listSuppliers(context, projectId, {
      status: status ?? undefined,
    });

    return jsonResponse({ suppliers });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — record a supplier in the project.
 *
 * The project comes from the path and the organization from the session; the
 * body carries substance only, and a client that tries to send either is
 * rejected rather than having the field quietly dropped.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const supplier = await supplierService.createSupplier(context, projectId, body);

    return jsonResponse({ supplier }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
