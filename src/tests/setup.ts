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
