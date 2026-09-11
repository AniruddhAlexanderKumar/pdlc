import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as designItemService from "@/server/services/design-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — design items in the project, ordered by identifier. Optional `?itemType=`. */
export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const itemType = new URL(request.url).searchParams.get("itemType");

    const designItems = await designItemService.listDesignItems(context, projectId, {
      itemType: itemType ?? undefined,
    });

    return jsonResponse({ designItems });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — create a design item in the project. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const designItem = await designItemService.createDesignItem(context, projectId, body);

    return jsonResponse({ designItem }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
