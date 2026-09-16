import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpView } from "./help-view";

/**
 * The three embedded explorers (EdgeRegistryExplorer, LifecycleExplorer,
 * TraversalLimitsSimulator) already have their own dedicated test suites
 * in `src/components/domain-explorers/` — these tests only cover that this
 * page actually renders them and that its own new interactive content (the
 * FAQ accordion) genuinely expands and collapses, not their internal
 * correctness a second time.
 */
describe("HelpView", () => {
  it("renders the real graph explorer, live", () => {
    render(<HelpView />);
    expect(screen.getByLabelText(/choose a node type/i)).toBeInTheDocument();
  });

  it("renders the lifecycle explorer, live", () => {
    render(<HelpView />);
    expect(screen.getByLabelText(/choose an artifact type/i)).toBeInTheDocument();
  });

  it("renders the traversal limits simulator, live", () => {
    render(<HelpView />);
    expect(screen.getByText("Request accepted")).toBeInTheDocument();
  });

  it("lists keyboard shortcuts, including the command palette", () => {
    render(<HelpView />);
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();
    expect(screen.getByText(/jump-to command palette/i)).toBeInTheDocument();
  });

  it("the FAQ accordion starts collapsed and expands a question on click", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    const question = "What's the difference between \"Simplify\" and removing a module?";
    expect(screen.queryByText(/only way an occasional module/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: question }));

    expect(screen.getByText(/only way an occasional module/i)).toBeInTheDocument();
  });

  it("keeps the honest static content this page has always made", () => {
    render(<HelpView />);
    expect(screen.getByText(/Invent a severity score/)).toBeInTheDocument();
  });
});
