"use client";

import * as React from "react";

/**
 * What a record's own page calls itself, for the breadcrumb trail.
 *
 * A record's URL ends in an opaque database id, and the breadcrumb trail
 * is built from the URL — so it used to end in "cmun…", which says
 * nothing about which requirement or change you are looking at. Only the
 * page knows the record's identifier, once it has loaded it; `PageHeader`
 * publishes it here, keyed by path, and `Breadcrumbs` reads it back.
 *
 * A module-level store read through `useSyncExternalStore`, not React
 * context: the header and the trail live in different branches of the
 * tree (the page and the layout's top bar), and a label published once is
 * still right when the same record is opened again, so there is nothing to
 * clear on the way out — the next visit shows the name straight away.
 */
const labels = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The label a page published for `path`, if any. */
export function useCrumbLabel(path: string): string | undefined {
  return React.useSyncExternalStore(
    subscribe,
    () => labels.get(path),
    () => undefined,
  );
}

/**
 * "SCN-REQ-001 — Maximum chamber pressure" → "SCN-REQ-001". A record's
 * page title leads with its identifier; the identifier alone is what fits
 * in a crumb and still names the record exactly.
 */
export function crumbFromTitle(title: string): string {
  return title.split(" — ")[0]!.trim();
}

/**
 * Renders nothing; publishes the crumb for `title` on the current path.
 *
 * Takes the page's whole title and derives the crumb here, on the client:
 * `PageHeader` also renders inside Server Components (the dashboard, for
 * one), and a server render may only pass values into a client module,
 * never call its functions — calling `crumbFromTitle` there took down
 * every server-rendered page.
 *
 * Reads `window.location` rather than `usePathname()` so it works in any
 * tree `PageHeader` renders in — including tests that mock only part of
 * `next/navigation`. By the time a page's effects run, the router has
 * already committed the new URL.
 */
export function CrumbLabel({ title }: { title: string }) {
  const label = crumbFromTitle(title);
  React.useEffect(() => {
    if (!label) return;
    const path = window.location.pathname;
    if (labels.get(path) === label) return;
    labels.set(path, label);
    for (const listener of listeners) listener();
  }, [label]);

  return null;
}
