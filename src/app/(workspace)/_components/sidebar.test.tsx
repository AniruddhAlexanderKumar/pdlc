import { render, screen } from "@testing-library/react";
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
});
