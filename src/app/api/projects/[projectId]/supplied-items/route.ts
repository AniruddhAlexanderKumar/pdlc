import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as suppliedItemService from "@/server/services/supplied-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — supplied items in the project. Optional `?supplierId=`, `?itemType=`, `?status=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const suppliedItems = await suppliedItemService.listSuppliedItems(context, projectId, {
      supplierId: params.get("supplierId") ?? undefined,
      itemType: params.get("itemType") ?? undefined,
      status: params.get("status") ?? undefined,
    });

    return jsonResponse({ suppliedItems });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — record something a supplier provides.
 *
 * The body names its supplier by id, which the service re-resolves inside this
 * project before writing. An id belonging to another project is rejected, so an
 * item can never be attached to a supplier the caller cannot see.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const suppliedItem = await suppliedItemService.createSuppliedItem(context, projectId, body);

    return jsonResponse({ suppliedItem }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
