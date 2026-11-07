"use client";

import * as React from "react";

/**
 * Reads a CSS media query's current match state, reactively.
 *
 * Built on `useSyncExternalStore` rather than `useState` + `useEffect`
 * specifically to avoid the two failure modes that pattern has for reading
 * external browser state: a synchronous `setState` inside an effect body
 * (an extra render pass on every mount) and a server/client hydration
 * mismatch (the server has no `window` to read at all). `getServerSnapshot`
 * always returns `false` — the server and the first client render agree on
 * "not matched" — and React itself handles resynchronizing to the real
 * value immediately after hydration, the behavior this hook exists for.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => mediaQueryList.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = () => false;

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
