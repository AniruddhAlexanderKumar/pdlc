import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { changeImpactAnalysisService } from "@/server/services/change-impact-analysis.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; changeId: string }>;
}

/**
 * POST — run a new impact analysis.
 *
 * Explicit by design: nothing recomputes on a page load. An analysis is a claim
 * about a moment, and silently re-running it would make "when was this
 * assessed, and against what?" unanswerable.
 *
 * Each run creates a new immutable record; none replaces its predecessor.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request).catch(() => ({}));

    const report = await changeImpactAnalysisService.runImpactAnalysis(
      context,
      projectId,
      changeId,
      body ?? {},
    );

    return jsonResponse({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET — every analysis run for this change, newest first. History is kept. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, changeId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const analyses = await changeImpactAnalysisService.listImpactAnalyses(
      context,
      projectId,
      changeId,
    );

    return jsonResponse({ analyses });
  } catch (error) {
    return errorResponse(error);
  }
}
