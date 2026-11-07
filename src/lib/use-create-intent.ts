"use client";

import * as React from "react";

/**
 * "Take me straight to the form": a list page opened with `?new=1` opens
 * its own "New …" dialog on arrival.
 *
 * Creating a record used to be three moves wherever you started — find the
 * step in the sidebar, find the right tab, find the button. The command
 * palette's Create entries and the project's "Start here" panel link here
 * instead, so starting a record is one move from anywhere. The list page is
 * still where you land, underneath the dialog, so closing it leaves you
 * somewhere that makes sense.
 */
export const CREATE_INTENT_PARAM = "new";

/** `/projects/p/risks` → `/projects/p/risks?new=1`. */
export function createIntentHref(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${CREATE_INTENT_PARAM}=1`;
}

function readRequested(): boolean {
  return new URLSearchParams(window.location.search).get(CREATE_INTENT_PARAM) === "1";
}

/** Fired after this hook rewrites the URL itself — `replaceState` raises no event of its own. */
const CHANGED_EVENT = "pdlc:create-intent-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

/**
 * A list page's create-dialog state, open on arrival when the URL asks.
 *
 * Reads `window.location` through `useSyncExternalStore` — the server and
 * the first client render agree on "closed", and React reopens it right
 * after hydration — rather than `useSearchParams`, so it drops into any
 * view without a Suspense boundary. Closing the dialog removes the
 * parameter, so a reload or Back does not open the form a second time.
 */
export function useCreateDialogState(): [boolean, (open: boolean) => void] {
  const requested = React.useSyncExternalStore(subscribe, readRequested, () => false);
  // `true` once opened by hand; otherwise the URL decides.
  const [openedByHand, setOpenedByHand] = React.useState(false);

  const setOpen = React.useCallback((next: boolean) => {
    setOpenedByHand(next);
    if (!next && readRequested()) {
      const url = new URL(window.location.href);
      url.searchParams.delete(CREATE_INTENT_PARAM);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      window.dispatchEvent(new Event(CHANGED_EVENT));
    }
  }, []);

  return [openedByHand || requested, setOpen];
}

/**
 * Follows a create link that points at the page you are already on — the
 * palette's "New risk" while looking at Risks. A router push to the same
 * page does not remount it, so nothing would read the new parameter; this
 * updates the URL in place and tells the page's hook to look again.
 * Returns false (and does nothing) for any other link.
 */
export function openCreateIntentInPlace(href: string): boolean {
  const target = new URL(href, window.location.href);
  if (
    target.pathname !== window.location.pathname ||
    target.searchParams.get(CREATE_INTENT_PARAM) !== "1"
  ) {
    return false;
  }
  window.history.pushState(null, "", `${target.pathname}${target.search}${target.hash}`);
  window.dispatchEvent(new Event(CHANGED_EVENT));
  return true;
}
