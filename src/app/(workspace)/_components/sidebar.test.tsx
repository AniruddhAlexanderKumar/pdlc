import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The sidebar reads the current route to decide two things: which item is
 * active, and — the behavior under test here — whether a module link
 * (Requirements, Risks, ...) should jump straight into the project the user
 * is already inside, instead of re-prompting them to pick one they are
 * already in.
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
  it("points module links at the global picker outside any project", () => {
    pathname = "/dashboard";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Requirements/ })).toHaveAttribute(
      "href",
      "/requirements",
    );
    expect(screen.getByRole("link", { name: /Risks/ })).toHaveAttribute("href", "/risks");
  });

  it("points module links straight at the current project once inside one", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements/req1aaaaaaaaaaaaaaaaaaaa";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Requirements/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements",
    );
    expect(screen.getByRole("link", { name: /Risks/ })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks",
    );
  });

  it("never rewrites Dashboard or Projects — they are not project modules", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Projects/ })).toHaveAttribute("href", "/projects");
  });

  it("marks the current-project-rewritten link as the active page", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks";
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Risks/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Requirements/ })).not.toHaveAttribute("aria-current");
  });
});
