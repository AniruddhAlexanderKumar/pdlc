import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as suppliedItemService from "@/server/services/supplied-item.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; suppliedItemId: string }>;
}

/**
 * Supplied item ↔ engineering relationships.
 *
 * This is a **typed** relationship endpoint, not a generic one: the body carries
 * a `relation` drawn from a fixed list, each naming one real join table with its
 * own foreign keys. There is no `entityType + entityId` pair, so a relation the
 * domain does not declare cannot reach the database.
 *
 * Every write validates the target against the same project before recording
 * anything. That is the boundary that keeps supplier impact honest — a link to
 * another project's design item would let a change declared here reach objects
 * the declarer has no access to.
 */

/** POST — record that this supplied item participates in some part of the product. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, suppliedItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const links = await suppliedItemService.linkSuppliedItem(
      context,
      projectId,
      suppliedItemId,
      body,
    );

    return jsonResponse({ links }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — remove one relationship. The body identifies which. */
export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { projectId, suppliedItemId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);

    const links = await suppliedItemService.unlinkSuppliedItem(
      context,
      projectId,
      suppliedItemId,
      body,
    );

    return jsonResponse({ links });
  } catch (error) {
    return errorResponse(error);
  }
}
