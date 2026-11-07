import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpView } from "./help-view";

/**
 * The three embedded explorers (EdgeRegistryExplorer, LifecycleExplorer,
 * TraversalLimitsSimulator) already have their own dedicated test suites
 * in `src/components/domain-explorers/` — these tests only cover that this
 * page actually renders them (inside the "Try it live" tab) and that its
 * own new interactive content (tabs, the FAQ accordion) genuinely works,
 * not their internal correctness a second time.
 */
describe("HelpView", () => {
  it("opens on Get started, with common tasks — not the concepts — as the default view", () => {
    render(<HelpView />);

    expect(screen.getByRole("heading", { name: "Common tasks" })).toBeInTheDocument();
    // "What this is" is philosophy, one tab over — useful, but not what
    // someone stuck on a task opened this page for.
    expect(screen.queryByRole("heading", { name: "What this is" })).not.toBeInTheDocument();
  });

  it("lists keyboard shortcuts, including the command palette, on the default tab", () => {
    render(<HelpView />);
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();
    expect(screen.getByText(/jump-to command palette/i)).toBeInTheDocument();
  });

  it("a task guide expands into real, ordered steps", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("button", { name: /how do i add someone to my organization/i }));

    const steps = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(steps.some((step) => /People tab/i.test(step))).toBe(true);
    expect(steps.some((step) => /Add a person/i.test(step))).toBe(true);
  });

  it("warns that adding someone sends no invitation email, since there is none to wait for", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("button", { name: /how do i add someone to my organization/i }));

    expect(screen.getByText(/no invitation email/i)).toBeInTheDocument();
  });

  it("offers a way out when the reader's question isn't covered", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("button", { name: /my question isn't here/i }));

    expect(screen.getByRole("link", { name: /public documentation/i })).toHaveAttribute("href", "/docs");
  });

  it("How it works keeps the honest static content this page has always made", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("tab", { name: "How it works" }));

    expect(screen.getByText(/Invent a severity score/)).toBeInTheDocument();
  });

  it("How it works describes the product without naming one industry exclusively", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("tab", { name: "How it works" }));

    expect(screen.getByText(/regulated and complex engineering/i)).toBeInTheDocument();
  });

  it("Try it live renders the real graph explorer, lifecycle explorer, and traversal simulator, live", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("tab", { name: "Try it live" }));

    expect(screen.getByLabelText(/choose a node type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose an artifact type/i)).toBeInTheDocument();
    expect(screen.getByText("Request accepted")).toBeInTheDocument();
  });

  it("the FAQ accordion starts collapsed and expands a question on click", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("tab", { name: "FAQ" }));
    expect(screen.queryByText(/Settings → Pages you use/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Can I hide a page I never use?" }));

    expect(screen.getByText(/Settings → Pages you use/)).toBeInTheDocument();
  });

  it("How it works describes the sidebar as the six steps of the work, with each step's pages as tabs", async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole("tab", { name: "How it works" }));

    expect(screen.getByText(/six numbered steps/)).toBeInTheDocument();
    expect(screen.queryByText(/Simplify/)).not.toBeInTheDocument();
  });
});
