import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

let pathname = `/projects/${PROJECT_ID}`;
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { ProjectTabs } = await import("./project-tabs");

afterEach(() => {
  pathname = `/projects/${PROJECT_ID}`;
});

describe("ProjectTabs", () => {
  it("renders every project module as a tab, scoped to this project", () => {
    render(<ProjectTabs projectId={PROJECT_ID} />);

    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}`,
    );
    expect(screen.getByRole("link", { name: /Requirements/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/requirements`,
    );
    expect(screen.getByRole("link", { name: /Decision Sentinel/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/sentinel`,
    );
    expect(screen.getByRole("link", { name: /Members/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/members`,
    );
  });

  it("marks Overview active on the project's own page, nothing else", () => {
    pathname = `/projects/${PROJECT_ID}`;
    render(<ProjectTabs projectId={PROJECT_ID} />);

    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Requirements/ })).not.toHaveAttribute("aria-current");
  });

  it("marks a module tab active on its list page", () => {
    pathname = `/projects/${PROJECT_ID}/risks`;
    render(<ProjectTabs projectId={PROJECT_ID} />);

    expect(screen.getByRole("link", { name: /Risks/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Overview/ })).not.toHaveAttribute("aria-current");
  });

  it("keeps a module tab active on that module's own detail sub-page", () => {
    pathname = `/projects/${PROJECT_ID}/risks/risk1aaaaaaaaaaaaaaaaaaaa`;
    render(<ProjectTabs projectId={PROJECT_ID} />);

    expect(screen.getByRole("link", { name: /Risks/ })).toHaveAttribute("aria-current", "page");
  });

  it("activates exactly one tab, never more than one, for a given page", () => {
    pathname = `/projects/${PROJECT_ID}/drift`;
    render(<ProjectTabs projectId={PROJECT_ID} />);

    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Drift");
  });
});
