import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { complianceItemService } from "@/server/services/compliance-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET — compliance items under one certification basis.
 *
 * `?basisId=` selects which basis; omitted, it defaults to the programme's
 * current ACTIVE basis, which is normally what a reader wants.
 */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const basisId = new URL(request.url).searchParams.get("basisId");
    const items = await complianceItemService.listItems(context, projectId, basisId ?? undefined);
    return jsonResponse({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — records a new compliance obligation under `?basisId=` (default: the active basis). */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const basisId = new URL(request.url).searchParams.get("basisId");
    const body = await readJsonBody(request);
    const item = await complianceItemService.createItem(context, projectId, basisId ?? undefined, body);
    return jsonResponse({ item }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
