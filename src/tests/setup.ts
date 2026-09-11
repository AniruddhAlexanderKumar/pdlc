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
