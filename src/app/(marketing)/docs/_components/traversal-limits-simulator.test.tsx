import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GRAPH_LIMITS } from "@/domain";
import { TraversalLimitsSimulator } from "./traversal-limits-simulator";

describe("TraversalLimitsSimulator", () => {
  it("accepts the default request — the same defaults the real API uses", () => {
    render(<TraversalLimitsSimulator />);
    expect(screen.getByText("Request accepted")).toBeInTheDocument();
  });

  it("refuses a depth past the real hard cap, and names the actual cap", () => {
    render(<TraversalLimitsSimulator />);
    const depthSlider = screen.getByLabelText(/max depth/i) as HTMLInputElement;

    // React tracks <input> values through its own property descriptor, so a
    // plain `.value = ...` assignment is invisible to it — set through the
    // native setter, then dispatch the event React actually listens for.
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setValue.call(depthSlider, String(GRAPH_LIMITS.maxMaxDepth + 1));
    depthSlider.dispatchEvent(new Event("change", { bubbles: true }));

    expect(screen.getByText("Request refused")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`exceeds the cap of ${GRAPH_LIMITS.maxMaxDepth}`))).toBeInTheDocument();
  });
});
