"use client";

import * as React from "react";

/**
 * A JSON-serializable preference persisted in localStorage, read and
 * written reactively.
 *
 * Generalizes `useStoredFlag`'s pattern (same `useSyncExternalStore` idiom,
 * same same-tab custom-event broadcast, since a native `storage` event only
 * fires in *other* tabs) to arbitrary structured state — column widths,
 * order and visibility; sort order; density; saved filter views. One data
 * grid can hold several of these side by side rather than each needing its
 * own bespoke hook.
 *
 * Scoped per browser, not per authenticated user or device — the same
 * accepted tradeoff `useStoredFlag`'s "Simplify" toggle already makes for
 * this exact class of preference in this codebase. A value that fails to
 * parse (corrupted, or written by an older shape) falls back to `fallback`
 * rather than throwing.
 *
 * `getSnapshot` must return a referentially stable value when nothing has
 * changed — `useSyncExternalStore` re-renders on every reference change, and
 * `JSON.parse` mints a new object on every call, so a naive read-and-parse
 * here would re-render on every single render (in the worst case, forever).
 * `cache` remembers the last raw string *and fallback* per key and reuses
 * the same value only while both are unchanged.
 *
 * `fallback` is part of that cache key, not just `raw` — deliberately,
 * found necessary by a genuinely failing test rather than added
 * speculatively: a caller whose fallback is itself derived from other
 * state (`useDataGridState` seeding a never-touched grid's density from
 * the reader's global preference, for instance) needs a change in that
 * *fallback* to actually take effect while `raw` stays `null` the whole
 * time. Comparing by reference (`===`), not deep equality — every caller
 * either passes a primitive (trivially `===`-stable by value) or memoizes
 * an object/array fallback (`React.useMemo`, or a module-level constant),
 * exactly so this comparison means what it should. A caller that instead
 * passes a fresh literal (`[]`, `{}`) inline on every render defeats this
 * cache and risks violating `useSyncExternalStore`'s stability contract —
 * not this module's bug to silently paper over, so it isn't; keep
 * fallbacks stable at the call site instead.
 */
const cache = new Map<string, { raw: string | null; fallback: unknown; value: unknown }>();

function changeEventName(key: string): string {
  return `pdlc:local-json-changed:${key}`;
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readCached<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw && Object.is(cached.fallback, fallback)) {
    return cached.value as T;
  }

  let value: T;
  if (raw === null) {
    value = fallback;
  } else {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, fallback, value });
  return value;
}

export function useStoredJson<T>(key: string, fallback: T): [T, (value: T | ((prev: T) => T)) => void] {
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

  const getSnapshot = React.useCallback(() => readCached(key, fallback), [key, fallback]);
  const getServerSnapshot = React.useCallback(() => fallback, [fallback]);

  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(readCached(key, fallback)) : next;
      const raw = JSON.stringify(resolved);
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Nothing to recover from — the event below still updates every
        // subscriber for the rest of this session, it just will not be
        // remembered on the next visit (private browsing, quota exceeded).
      }
      cache.set(key, { raw, fallback, value: resolved });
      window.dispatchEvent(new Event(changeEventName(key)));
    },
    [key, fallback],
  );

  return [value, setValue];
}
