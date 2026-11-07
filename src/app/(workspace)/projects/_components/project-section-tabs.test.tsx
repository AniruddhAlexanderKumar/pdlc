import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The other half of the sidebar-plus-tabs layout: the pages of the section
 * you are in, as tabs above the content, and — on the six steps — where
 * you are in the work and what comes next.
 */
let pathname = "/projects/p1/requirements";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { ProjectSectionTabs } = await import("./project-section-tabs");

const PROJECT = "/projects/p1";

// These tests cover every tool, so they run with Simple view off ("Show all
// tools"); Simple view itself is covered at the end of the sidebar tests.
beforeEach(() => {
  window.localStorage.setItem("pdlc:workflow-advanced-mode", "1");
});

afterEach(() => {
  pathname = `${PROJECT}/requirements`;
  window.localStorage.clear();
});

function tabs(sectionLabel: string) {
  return within(screen.getByRole("navigation", { name: `${sectionLabel} pages` })).getAllByRole("link");
}

describe("ProjectSectionTabs", () => {
  it("shows the current step's pages as tabs, with the current one marked", () => {
    pathname = `${PROJECT}/requirements`;
    render(<ProjectSectionTabs />);

    const links = tabs("Define");
    expect(links.map((link) => link.textContent)).toEqual(["Requirements", "Stakeholder needs"]);
    expect(links[0]).toHaveAttribute("href", `${PROJECT}/requirements`);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
  });

  it("says which step this is, in the reader's words, and links to the next one", () => {
    pathname = `${PROJECT}/verification`;
    render(<ProjectSectionTabs />);

    expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();
    expect(screen.getByText(/How do we know it works\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next step: Control change/ })).toHaveAttribute(
      "href",
      `${PROJECT}/changes`,
    );
  });

  it("keeps the tab bar on a record's own page, with its module's tab current", () => {
    pathname = `${PROJECT}/risks/risk-1`;
    render(<ProjectSectionTabs />);

    const risks = tabs("Control change").find((link) => link.textContent === "Risks");
    expect(risks).toHaveAttribute("aria-current", "page");
  });

  it("a step with one page shows where you are and what's next, without a one-tab bar", () => {
    pathname = `${PROJECT}/decisions`;
    render(<ProjectSectionTabs />);

    expect(screen.getByText("Step 3 of 6")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next step: Verify/ })).toBeInTheDocument();
  });

  it("the last step points at the release check, where the work is judged complete", () => {
    pathname = `${PROJECT}/baselines`;
    render(<ProjectSectionTabs />);

    expect(screen.getByText("Step 6 of 6")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Next step/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run the release check/i })).toHaveAttribute(
      "href",
      `${PROJECT}?gate=RELEASE_READY#release-check`,
    );
  });

  it("gives the project tools tabs, but no step line — they serve every step", () => {
    pathname = `${PROJECT}/history`;
    render(<ProjectSectionTabs />);

    expect(tabs("Project tools").map((link) => link.textContent)).toEqual([
      "Traceability",
      "Engineering History",
      "Decision Sentinel",
    ]);
    expect(screen.queryByText(/Step \d of/)).not.toBeInTheDocument();
  });

  it("renders nothing on the project's own page, Command Center, or Team — each is one page with no step", () => {
    for (const path of [PROJECT, `${PROJECT}/command-center`, `${PROJECT}/members`]) {
      pathname = path;
      const { container, unmount } = render(<ProjectSectionTabs />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("leaves out a page hidden in Settings — unless it is the page you are on", () => {
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: ["/observations", "/drift"] }),
    );

    pathname = `${PROJECT}/changes`;
    const { unmount } = render(<ProjectSectionTabs />);
    expect(tabs("Control change").map((link) => link.textContent)).toEqual(["Changes", "Risks", "Issues"]);
    unmount();

    pathname = `${PROJECT}/drift`;
    render(<ProjectSectionTabs />);
    expect(tabs("Control change").map((link) => link.textContent)).toContain("Drift");
  });

  it("skips a fully hidden step when pointing to the next one", () => {
    window.localStorage.setItem("pdlc:nav-customization", JSON.stringify({ hidden: ["/decisions"] }));
    pathname = `${PROJECT}/design-items`;
    render(<ProjectSectionTabs />);

    expect(screen.getByRole("link", { name: /Next step: Verify/ })).toBeInTheDocument();
  });
});
