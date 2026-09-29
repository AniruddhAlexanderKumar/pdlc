"use client";

import * as React from "react";

/**
 * A boolean preference persisted in localStorage, read and written
 * reactively — the same `useSyncExternalStore` idiom `useMediaQuery` uses,
 * and for the same reasons: server and the first client render must agree
 * (there is no `window` on the server), and a plain `useState` +
 * `useEffect` sync-on-mount is exactly the cascading-render pattern React's
 * own lint rules (`react-hooks/set-state-in-effect`) warn against.
 *
 * A native `storage` event only fires in *other* tabs/windows, never the
 * one that made the write — so a change from this same tab's own setter
 * dispatches a matching custom event too, which is what lets every
 * component reading the same key (not just this hook's own instance) see
 * the update immediately.
 */
function changeEventName(key: string): string {
  return `pdlc:local-flag-changed:${key}`;
}

function readFlag(key: string, defaultValue: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? defaultValue : raw === "1";
  } catch {
    return defaultValue;
  }
}

/** @param defaultValue What an unset key reads as — before anyone has ever touched this preference. */
export function useStoredFlag(key: string, defaultValue = false): [boolean, (value: boolean) => void] {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const eventName = changeEventName(key);
      window.addEventListener("storage", onChange);
      window.addEventListener(eventName, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(eventName, onChange);
      };
    },
    [key],
  );

  const getSnapshot = React.useCallback(() => readFlag(key, defaultValue), [key, defaultValue]);
  const getServerSnapshot = React.useCallback(() => defaultValue, [defaultValue]);

  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = React.useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Nothing to recover from — the event below still updates every
        // subscriber (including this one) for the rest of this session, it
        // just will not be remembered on the next visit.
      }
      window.dispatchEvent(new Event(changeEventName(key)));
    },
    [key],
  );

  return [value, setValue];
}
