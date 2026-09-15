import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GRAPH_NODE_TYPES } from "@/domain";
import { EdgeRegistryExplorer } from "./edge-registry-explorer";
import { LifecycleExplorer } from "./lifecycle-explorer";

/**
 * Both explorers read live from `@/domain` — these tests exist to catch
 * the explorer going stale relative to the registry it claims to browse
 * (e.g. a node type renamed in the domain layer but not reflected in the
 * <option> list), not to re-test the registry's own correctness.
 */

describe("EdgeRegistryExplorer", () => {
  it("offers every real node type as a choice", () => {
    render(<EdgeRegistryExplorer />);
    const select = screen.getByLabelText(/choose a node type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    for (const type of GRAPH_NODE_TYPES) {
      expect(optionValues).toContain(type);
    }
  });

  it("shows real edges for the default selection (REQUIREMENT)", () => {
    render(<EdgeRegistryExplorer />);
    // REQUIREMENT_VERIFIED_BY is a real, registered edge out of REQUIREMENT.
    expect(screen.getByText(/requirement verified by/i)).toBeInTheDocument();
  });

  it("switching node type changes what is shown", async () => {
    const user = userEvent.setup();
    render(<EdgeRegistryExplorer />);
    const select = screen.getByLabelText(/choose a node type/i);

    await user.selectOptions(select, "SUPPLIER");

    expect(screen.getByText(/out of supplier/i)).toBeInTheDocument();
  });
});

describe("LifecycleExplorer", () => {
  it("renders the real Requirement transition table by default, including its terminal state", () => {
    render(<LifecycleExplorer />);
    expect(screen.getAllByText("OBSOLETE").length).toBeGreaterThan(0);
    expect(screen.getByText(/terminal, no further transition/i)).toBeInTheDocument();
  });

  it("switching artifact type shows a different real table", async () => {
    const user = userEvent.setup();
    render(<LifecycleExplorer />);

    await user.selectOptions(screen.getByLabelText(/choose an artifact type/i), "Risk");

    // Risk's real transition table includes OPEN, which Requirement's does not.
    expect(screen.getByText("OPEN")).toBeInTheDocument();
  });
});
