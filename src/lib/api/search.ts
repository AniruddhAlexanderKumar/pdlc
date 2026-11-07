"use client";

import * as React from "react";
import {
  SEARCH_TERM_MIN_LENGTH,
  type SearchEntityType,
  type SearchResponse,
} from "@/domain/search";
import { requestJson } from "./client";

/**
 * Search, read from the command palette.
 *
 * Debounced and abortable: the palette fires on every keystroke, and
 * without both, a fast typist leaves a trail of in-flight requests whose
 * responses can land out of order and show results for a prefix of what
 * they actually typed. `useResource` covers the ordinary "load once"
 * case and is the right tool nearly everywhere else; a query that changes
 * on every keypress is not that case, so this hook manages its own
 * lifecycle.
 */

const DEBOUNCE_MS = 180;

export interface SearchOptions {
  projectId?: string;
  types?: readonly SearchEntityType[];
  limit?: number;
}

export async function fetchSearch(
  term: string,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: term });
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.types?.length) params.set("types", options.types.join(","));
  if (options.limit) params.set("limit", String(options.limit));

  return requestJson<SearchResponse>(`/api/search?${params.toString()}`, "search", { signal });
}

export type SearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "ready"; data: SearchResponse }
  | { phase: "error"; message: string };

export function useSearch(term: string, options: SearchOptions = {}): SearchState {
  const [fetched, setFetched] = React.useState<SearchState>({ phase: "idle" });

  const trimmed = term.trim();
  const active = trimmed.length >= SEARCH_TERM_MIN_LENGTH;

  // Serialised so a caller passing a fresh object literal every render does
  // not restart the search on every render.
  const optionsKey = JSON.stringify({
    projectId: options.projectId ?? null,
    types: options.types ?? null,
    limit: options.limit ?? null,
  });

  React.useEffect(() => {
    if (!active) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFetched({ phase: "searching" });
      fetchSearch(trimmed, JSON.parse(optionsKey) as SearchOptions, controller.signal)
        .then((data) => setFetched({ phase: "ready", data }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFetched({
            phase: "error",
            message: error instanceof Error ? error.message : "Search failed.",
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, optionsKey]);

  // Derived during render rather than written back from the effect, which
  // would cascade a second render for something already knowable here.
  //
  // The `query` comparison matters for honesty as much as tidiness: between
  // a keystroke and its debounced request, `fetched` still holds results for
  // the *previous* term. Showing those under the new one would be showing an
  // answer to a question the reader has already moved on from, so this
  // reports it as still searching until the server's own echoed term agrees
  // with what is in the box.
  if (!active) return { phase: "idle" };
  if (fetched.phase === "ready" && fetched.data.query !== trimmed) return { phase: "searching" };
  return fetched;
}
