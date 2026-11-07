import {
  SEARCH_LIMIT_DEFAULT,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  searchRequestSchema,
} from "@/domain/search";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as searchRepository from "@/server/repositories/search.repository";
import { parseOrThrow } from "@/server/validation";
import { hasImplicitProjectAccess } from "./authorization.service";

/**
 * Cross-artifact search.
 *
 * This service is deliberately thin, and that is the security argument for
 * it rather than an apology: the authorization is expressed *in the query*
 * (see `search.repository.ts`), so there is no post-filter here that could
 * be forgotten, reordered, or skipped on one branch. The only decision this
 * layer makes is the single boolean the query needs — whether this caller
 * holds the implicit organization-wide grant — and it asks
 * `authorization.service.ts` for that, like every other service does.
 *
 * ## No scoring reaches the caller
 *
 * The query ranks internally, because an unordered search is useless. The
 * rank never leaves the repository: the row shape it returns carries one,
 * this function drops it, and the DTO has nowhere to put it. What the
 * caller gets instead is `matchKind` — *how* it matched, which is a fact
 * about the record rather than a manufactured number about its quality.
 *
 * ## Why an unreachable project id is not an error
 *
 * Searching inside a project the caller cannot read returns no results
 * rather than 403. The alternative would confirm that project exists, which
 * is precisely the inference the 404-not-403 convention elsewhere in this
 * codebase exists to prevent.
 */

export async function search(
  context: OrganizationContext,
  input: unknown,
): Promise<SearchResponse> {
  const request: SearchRequest = parseOrThrow(searchRequestSchema, input, "Invalid search request");

  // No actor means no session, and therefore no readable project. Returning
  // empty rather than throwing keeps this consistent with the rule above:
  // nothing about what exists is revealed either way.
  if (!context.actorId) {
    return { query: request.q, results: [], truncated: false };
  }

  const limit = request.limit ?? SEARCH_LIMIT_DEFAULT;

  // One more than asked for, so "there are further matches" is observed
  // rather than guessed from a conveniently round count.
  const rows = await searchRepository.search({
    organizationId: context.organizationId,
    actorId: context.actorId,
    hasImplicitProjectAccess: await hasImplicitProjectAccess(context),
    term: request.q,
    projectId: request.projectId,
    types: request.types,
    limit: limit + 1,
  });

  const truncated = rows.length > limit;
  const results: SearchResult[] = rows.slice(0, limit).map((row) => ({
    type: row.type,
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    status: row.status,
    projectId: row.projectId,
    projectName: row.projectName,
    ownerName: row.ownerName,
    updatedAt: row.updatedAt.toISOString(),
    matchKind: row.matchKind,
  }));

  return { query: request.q, results, truncated };
}
