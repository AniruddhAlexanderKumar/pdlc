"use client";

import * as React from "react";

/**
 * The loading pattern every module's hooks are built on.
 *
 * Extracted so the projects, requirements and artifact clients share one
 * implementation rather than three copies of the same subtle effect. It is a
 * deliberately small primitive, not a data-fetching framework: no cache, no
 * deduplication, no global store.
 */

export type LoadState<T> =
  | { phase: "loading" }
  | { phase: "error"; error: unknown }
  | { phase: "ready"; data: T };

export interface Resource<T> {
  state: LoadState<T>;
  reload: () => void;
  /** Replaces the loaded value with an authoritative object returned by a mutation. */
  set: (data: T) => void;
}

/**
 * @param load fetcher; memoize it with `useCallback` so it is stable
 * @param key identifies *what* is being loaded — changing it refetches, so a
 *   view pointed at a different record never shows the previous one's data
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
): Resource<T> {
  const [nonce, setNonce] = React.useState(0);
  const [result, setResult] = React.useState<{ token: string; state: LoadState<T> } | null>(null);

  // A result belongs to the request that produced it. Changing the key or
  // reloading mints a new token, so "loading" is *derived* from a stale token
  // rather than written into state at the start of every fetch — no
  // synchronous setState in the effect, and no stale data shown mid-refetch.
  const token = `${key}#${nonce}`;
  const state: LoadState<T> = result?.token === token ? result.state : { phase: "loading" };

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    load(controller.signal)
      .then((data) => {
        if (!cancelled) setResult({ token, state: { phase: "ready", data } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ token, state: { phase: "error", error } });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load, token]);

  return {
    state,
    reload: React.useCallback(() => setNonce((value) => value + 1), []),
    set: React.useCallback(
      (data: T) => setResult({ token, state: { phase: "ready", data } }),
      [token],
    ),
  };
}
