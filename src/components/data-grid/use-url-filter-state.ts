"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter state that lives in the URL query string (§2: "Filters serialize
 * to the URL so a filtered view is a shareable link"). `defaults` names
 * every filter key this view has and its empty value — a key holding its
 * default is omitted from the URL entirely, so a plain list URL stays
 * plain rather than accumulating `?status=&priority=`.
 *
 * Generic over any `Record<string, string>` shape; a caller with a
 * non-string filter (a multi-select, say) serializes it to a single
 * comma-joined string field rather than this hook growing per-shape logic.
 */
export function useUrlFilterState<T extends Record<string, string>>(
  defaults: T,
): [T, (next: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = React.useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = searchParams.get(String(key));
      if (value !== null) result[key] = value as T[keyof T];
    }
    return result;
  }, [searchParams, defaults]);

  const setState = React.useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...state, ...patch };
      for (const key of Object.keys(defaults) as (keyof T)[]) {
        const value = merged[key];
        if (value === defaults[key] || value === "" || value === undefined) {
          params.delete(String(key));
        } else {
          params.set(String(key), String(value));
        }
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, state, defaults],
  );

  return [state, setState];
}
