import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * POST — runs detection: reads recent engineering object revisions and
 * relationship changes, and creates/updates surveillance targets for the
 * real dependencies each implies. Explicit only — nothing in this codebase
 * calls this route on a schedule or on another request's behalf.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const summary = await decisionSentinelService.detectProjectChanges(context, projectId, body);
    return jsonResponse({ summary });
  } catch (error) {
    return errorResponse(error);
  }
}
