import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as decisionService from "@/server/services/engineering-decision.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; decisionId: string }>;
}

/** GET — every artifact this decision affected or depended on. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const links = await decisionService.listDecisionLinks(context, projectId, decisionId);
    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — add a trace edge.
 *
 * The body is a discriminated union on `relation`, so each variant maps to
 * one real join table. The target must live in the same project.
 */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const links = await decisionService.linkDecision(context, projectId, decisionId, body);

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
    const { projectId, decisionId } = await routeContext.params;
    const context = await requireAuthenticatedContext();

    const params = new URL(request.url).searchParams;
    const linkType = params.get("linkType");

    const links = await decisionService.unlinkDecision(context, projectId, decisionId, {
      relation: params.get("relation"),
      targetId: params.get("targetId"),
      ...(linkType ? { linkType } : {}),
    });

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}
