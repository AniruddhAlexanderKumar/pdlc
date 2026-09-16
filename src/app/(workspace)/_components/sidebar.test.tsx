import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The sidebar is the workspace's one navigation list — it switches its own
 * contents by context (outside vs. inside a project) rather than adding a
 * second surface alongside it. These tests cover that switch and the
 * active-state logic it depends on.
 */
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { Sidebar } = await import("./sidebar");

afterEach(() => {
  pathname = "/dashboard";
  window.localStorage.clear();
});

describe("Sidebar", () => {
  it("shows the global project pickers outside any project", () => {
    pathname = "/dashboard";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /^Requirements$/ })).toHaveAttribute(
      "href",
      "/requirements",
    );
    expect(screen.getByRole("link", { name: /^Risks$/ })).toHaveAttribute("href", "/risks");
    // Modules that only exist once a project is open (Command Center,
    // Certification, ...) have nowhere to point outside one, so they are
    // not shown at all rather than shown broken.
    expect(screen.queryByRole("link", { name: /Command Center/ })).not.toBeInTheDocument();
  });

  it("switches to every real module of the current project once inside one", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements/req1aaaaaaaaaaaaaaaaaaaa";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /^Requirements$/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements",
    );
    expect(screen.getByRole("link", { name: /Command Center/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/command-center",
    );
    expect(screen.getByRole("link", { name: /Decision Sentinel/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/sentinel",
    );
    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa",
    );
  });

  it("never rewrites Dashboard or Projects — they are always the global pages", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Projects/ })).toHaveAttribute("href", "/projects");
  });

  it("marks the current module active, and nothing else, on a module list page", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /^Risks$/ })).toHaveAttribute("aria-current", "page");
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
  });

  it("keeps a module active on its own detail sub-page, without also activating Overview", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks/risk1aaaaaaaaaaaaaaaaaaaa";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /^Risks$/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Overview/ })).not.toHaveAttribute("aria-current");
  });

  it("marks Overview active on the project's own page only", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Requirements$/ })).not.toHaveAttribute("aria-current");
  });

  it("Simplify collapses to daily-tier modules only, and remembers the choice", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar />);

    // Weekly/occasional-tier modules are present by default.
    expect(screen.getByRole("link", { name: /Traceability/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Requirements$/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simplify" }));

    expect(screen.queryByRole("link", { name: /Traceability/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Requirements$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all modules" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // A fresh mount (the next page navigation, in practice) reads the same
    // stored choice back rather than resetting to "everything shown".
    unmount();
    render(<Sidebar />);
    expect(await screen.findByRole("button", { name: "Show all modules" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Traceability/ })).not.toBeInTheDocument();
  });

  it("pinning a module moves it into its own Pinned section, and survives Simplify", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    const user = userEvent.setup();
    render(<Sidebar />);

    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();

    // Traceability is weekly-tier — normally visible, but the first thing
    // Simplify collapses away, which is exactly why it is a real test of
    // "pinned survives Simplify" and not just "pinned is visible".
    await user.click(screen.getByRole("button", { name: "Pin Traceability" }));

    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpin Traceability" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Simplify" }));
    expect(screen.getByRole("link", { name: /Traceability/ })).toBeInTheDocument();
  });

  it("unpinning removes the module from the Pinned section", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Pin Traceability" }));
    expect(screen.getByText("Pinned")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unpin Traceability" }));
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("a pinned module is remembered across a fresh mount", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Pin Traceability" }));
    unmount();

    render(<Sidebar />);
    expect(await screen.findByText("Pinned")).toBeInTheDocument();
  });

  it("a module with no default sidebar residency (Suppliers — occasional tier, no group) can be pinned via stored preference (the Settings page, in practice), and then appears even under Simplify", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: [], pinned: ["/suppliers"] }),
    );
    const user = userEvent.setup();
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Suppliers/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simplify" }));
    expect(screen.getByRole("link", { name: /Suppliers/ })).toBeInTheDocument();
  });

  it("a module hidden via stored preference (the Settings page, in practice) is absent everywhere, including Command Center's own residency exception never applying to it", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: ["/risks"], pinned: [] }),
    );
    render(<Sidebar />);

    expect(screen.queryByRole("link", { name: /^Risks$/ })).not.toBeInTheDocument();
  });

  it("Command Center can never be hidden or pinned, even via directly-written storage", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: ["/command-center"], pinned: ["/command-center"] }),
    );
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Command Center/ })).toBeInTheDocument();
    // Not duplicated into a Pinned section either — it stays in its one,
    // fixed, always-visible spot.
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("a hidden module disappears from the outside-project picker list too — one preference, everywhere the module could appear", () => {
    pathname = "/dashboard";
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: ["/risks"], pinned: [] }),
    );
    render(<Sidebar />);

    expect(screen.queryByRole("link", { name: /^Risks$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Requirements$/ })).toBeInTheDocument();
  });

  it("the pin toggle only appears once the sidebar is expanded, not on the collapsed icon rail", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa";
    const user = userEvent.setup();
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: "Pin Traceability" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByRole("button", { name: "Pin Traceability" })).not.toBeInTheDocument();
  });
});
