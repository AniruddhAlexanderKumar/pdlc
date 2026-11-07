import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as projectProgressService from "@/server/services/project-progress.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — where this project stands, stage by stage, and the one thing to do next. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const progress = await projectProgressService.getProjectProgress(context, projectId);
    return jsonResponse({ progress });
  } catch (error) {
    return errorResponse(error);
  }
}
