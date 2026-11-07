import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as qualificationService from "@/server/services/supplier-qualification.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — qualifications in the project. Optional `?supplierId=`,
 * `?suppliedItemId=`, `?status=`.
 *
 * Statuses are returned exactly as recorded. Nothing here re-derives one from an
 * expiry date — a date in the past is a fact about the record, not a state
 * change the system is entitled to make.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const qualifications = await qualificationService.listSupplierQualifications(
      context,
      projectId,
      {
        supplierId: params.get("supplierId") ?? undefined,
        suppliedItemId: params.get("suppliedItemId") ?? undefined,
        status: params.get("status") ?? undefined,
      },
    );

    return jsonResponse({ qualifications });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — record a qualification.
 *
 * Both parents are re-resolved inside this project, and when an item is given it
 * must be provided by the named supplier — a qualification pointing at one
 * supplier's record and another's item would assert something false about both.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const qualification = await qualificationService.createSupplierQualification(
      context,
      projectId,
      body,
    );

    return jsonResponse({ qualification }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
