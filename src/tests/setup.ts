import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library registers its own auto-cleanup only when Vitest runs with
// `globals: true`. This project keeps globals off (explicit imports), so the
// unmount has to be wired up here — without it, rendered trees accumulate in
// document.body across tests in a file and queries start matching stale nodes.
afterEach(() => {
  cleanup();
});

// jsdom does not implement ResizeObserver — real browsers all do, but any
// component that measures its own container (the traceability graph view's
// responsive sizing, and any future one) needs this to exist at all in a
// jsdom test. A no-op is correct here: layout measurement itself is not
// under test in a jsdom environment with no real rendering engine.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no real layout engine — every element's offsetHeight/offsetWidth
// is 0 by default. `@tanstack/react-virtual` (the data grid's row
// virtualization) measures its scroll container through exactly those two
// properties (`getRect()` in `@tanstack/virtual-core` — not
// `getBoundingClientRect()`, which jsdom *does* implement, just also always
// zeroed), so a real value is required here or every virtualized row renders
// as if permanently scrolled out of view. Same reasoning as the
// ResizeObserver polyfill above: layout measurement itself is not under
// test, a plausible fixed size just needs to exist so a virtualizer has
// something to compute a visible range from.
if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
}

// jsdom does not implement matchMedia either — real browsers all do, and
// `useMediaQuery` (the sidebar's responsive collapse, and any future
// consumer) reads it directly. Reporting "not matched" unconditionally is
// correct here for the same reason `getServerSnapshot` in that hook does the
// same: no test in this project asserts on live viewport-resize behavior, so
// components using it should just render at their non-collapsed default.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
