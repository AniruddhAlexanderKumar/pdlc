import { SEARCH_ENTITY_TYPES, type SearchEntityType } from "@/domain/search";
import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as searchService from "@/server/services/search.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=&projectId=&types=&limit=
 *
 * Cross-artifact search over everything the caller can read. Scope is never
 * taken from the request: `?projectId=` can only ever *narrow* the set the
 * session already allows, and an unreachable one simply matches nothing.
 *
 * `?types=` is a comma-separated list. Unknown values are dropped rather
 * than rejected, so a link from an older client keeps working instead of
 * returning 400 for a type that has since been renamed — but a list that
 * names *only* unknown types is left empty and the schema then rejects it,
 * which is the honest outcome: that request asked for nothing that exists.
 */
export async function GET(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const params = new URL(request.url).searchParams;

    const requestedTypes = params.get("types");
    const types = requestedTypes
      ? requestedTypes
          .split(",")
          .map((value) => value.trim())
          .filter((value): value is SearchEntityType =>
            (SEARCH_ENTITY_TYPES as readonly string[]).includes(value),
          )
      : undefined;

    const limit = params.get("limit");

    const results = await searchService.search(context, {
      q: params.get("q") ?? "",
      projectId: params.get("projectId") ?? undefined,
      types: types && types.length > 0 ? types : undefined,
      limit: limit === null ? undefined : Number(limit),
    });

    return jsonResponse({ search: results });
  } catch (error) {
    return errorResponse(error);
  }
}
