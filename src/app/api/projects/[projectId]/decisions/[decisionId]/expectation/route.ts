import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/**
 * GET — what the decision was expected to produce, and what was observed.
 * Returns `{ expectation: null }` when none has been recorded; that is an
 * answer, not an error.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const expectation = await decisionService.getExpectation(context, projectId, decisionId);
    return jsonResponse({ expectation });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT — set or replace the decision's single expectation.
 *
 * Idempotent by design: the relationship is 1:1, so the caller does not need
 * to know whether one already exists. An observation may be recorded here but
 * is never inferred — supplying an actual value does not mark it HELD.
 */
export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const expectation = await decisionService.setExpectation(context, projectId, decisionId, body);

    return jsonResponse({ expectation });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — clear the expectation. */
export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    await decisionService.clearExpectation(context, projectId, decisionId);

    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
