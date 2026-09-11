import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as requirementService from "@/server/services/requirement.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; requirementId: string }>;
}

/** GET — every trace edge on the requirement, with enough of each target to display it. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const links = await requirementService.listRequirementLinks(context, projectId, requirementId);

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — add a trace edge.
 *
 * The body is a discriminated union on `relation`, so each variant maps to one
 * real join table with its own valid link types. The target must live in the
 * same project; anything else is rejected.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const links = await requirementService.linkRequirement(
      context,
      projectId,
      requirementId,
      body,
    );

    return jsonResponse({ links }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE — remove a trace edge, identified by query parameters
 * (`?relation=…&targetId=…&linkType=…`) so the request needs no body.
 */
export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, requirementId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const params = new URL(request.url).searchParams;
    const linkType = params.get("linkType");

    const links = await requirementService.unlinkRequirement(context, projectId, requirementId, {
      relation: params.get("relation"),
      targetId: params.get("targetId"),
      ...(linkType ? { linkType } : {}),
    });

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}
