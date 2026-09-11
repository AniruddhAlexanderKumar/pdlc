import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; requirementId: string }>;
}

/**
 * GET /api/projects/[projectId]/requirements/[requirementId]
 *
 * The requirement with its owner, traceability, legal next transitions,
 * editability flags and audit history. A requirement in another organization's
 * project returns 404, never 403.
 */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const requirement = await requirementService.getRequirement(context, projectId, requirementId);

    return jsonResponse({ requirement });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH — content fields only.
 *
 * Status is not accepted here: lifecycle changes go through /transition so
 * they are checked against the transition table.
 */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const requirement = await requirementService.updateRequirement(
      context,
      projectId,
      requirementId,
      body,
    );

    return jsonResponse({ requirement });
  } catch (error) {
    return errorResponse(error);
  }
}
