import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The sidebar holds places, not pages: outside a project just Dashboard and
 * Projects; inside one, Overview, Command Center, the six numbered steps
 * of the work, and the tools and team behind them. The pages inside each
 * place are tabs above the content (`project-section-tabs.test.tsx`).
 */
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { Sidebar } = await import("./sidebar");

const PROJECT = "/projects/proj1aaaaaaaaaaaaaaaaaaa";

afterEach(() => {
  pathname = "/dashboard";
  window.localStorage.clear();
});

function primaryNav() {
  return within(screen.getByRole("navigation", { name: "Primary" }));
}

describe("Sidebar", () => {
  it("outside a project shows only the global places, and says where the steps are", () => {
    pathname = "/dashboard";
    render(<Sidebar />);

    const nav = primaryNav();
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(nav.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(nav.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText(/open a project to see its steps/i)).toBeInTheDocument();
  });

  it("shows Executive only to a reader who can open it", () => {
    const { unmount } = render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Executive" })).not.toBeInTheDocument();
    unmount();

    render(<Sidebar showPortfolio />);
    expect(screen.getByRole("link", { name: "Executive" })).toHaveAttribute("href", "/executive");
  });

  it("inside a project lists the six steps in order, each landing on its first page", () => {
    pathname = PROJECT;
    render(<Sidebar />);

    const steps = primaryNav().getAllByRole("link", { name: /^Step \d/ });
    expect(steps.map((link) => link.getAttribute("href"))).toEqual([
      `${PROJECT}/requirements`,
      `${PROJECT}/design-items`,
      `${PROJECT}/decisions`,
      `${PROJECT}/verification`,
      `${PROJECT}/changes`,
      `${PROJECT}/baselines`,
    ]);
  });

  it("shows each step's plain question, so the sidebar reads as the order of the work", () => {
    pathname = PROJECT;
    render(<Sidebar />);

    expect(screen.getByText("What are we trying to build?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Step 4: Verify — How do we know it works?" })).toBeInTheDocument();
  });

  it("is a short list — places, not every page", () => {
    pathname = PROJECT;
    render(<Sidebar />);

    // Dashboard, Projects, Overview, Command Center, six steps, tools, team.
    expect(primaryNav().getAllByRole("link")).toHaveLength(12);
    // No per-page links, and none of the controls the old long list needed.
    expect(screen.queryByRole("link", { name: /^Risks$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simplify|show all modules/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pin|^unpin/i })).not.toBeInTheDocument();
  });

  it("links Overview, Command Center, tools and team", () => {
    pathname = PROJECT;
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", PROJECT);
    expect(screen.getByRole("link", { name: "Command Center" })).toHaveAttribute(
      "href",
      `${PROJECT}/command-center`,
    );
    expect(screen.getByRole("link", { name: "Project tools" })).toHaveAttribute(
      "href",
      `${PROJECT}/traceability`,
    );
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute("href", `${PROJECT}/members`);
  });

  it("marks the step you are in as current — on any of its pages, including a record's own page", () => {
    pathname = `${PROJECT}/risks/risk1aaaaaaaaaaaaaaaaaaaa`;
    render(<Sidebar />);

    const current = primaryNav()
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Step 5: Control change/);
  });

  it("counts a supplied item's page as part of the Design step, where Suppliers is", () => {
    pathname = `${PROJECT}/supplied-items/item1aaaaaaaaaaaaaaaaaaaa`;
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Step 2: Design/ })).toHaveAttribute("aria-current", "page");
  });

  it("marks Overview current on the project's own page only", () => {
    pathname = PROJECT;
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Step 1: Define/ })).not.toHaveAttribute("aria-current");
  });

  it("never marks Projects current once inside a project — the project's own places say where you are", () => {
    pathname = `${PROJECT}/requirements`;
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Projects" })).not.toHaveAttribute("aria-current");
  });

  it("a step whose first page is hidden (in Settings) lands on its next page instead", () => {
    pathname = PROJECT;
    window.localStorage.setItem("pdlc:nav-customization", JSON.stringify({ hidden: ["/requirements"] }));
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /Step 1: Define/ })).toHaveAttribute(
      "href",
      `${PROJECT}/stakeholder-needs`,
    );
  });

  it("a step whose every page is hidden drops out, rather than linking nowhere", () => {
    pathname = PROJECT;
    window.localStorage.setItem("pdlc:nav-customization", JSON.stringify({ hidden: ["/decisions"] }));
    render(<Sidebar />);

    expect(screen.queryByRole("link", { name: /Step 3: Decide/ })).not.toBeInTheDocument();
    // The other steps keep their own numbers.
    expect(screen.getByRole("link", { name: /Step 4: Verify/ })).toBeInTheDocument();
  });

  it("collapses to an icon rail that still names every link, and expands again", async () => {
    pathname = PROJECT;
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("What are we trying to build?")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Step 1: Define/ })).toHaveAttribute("href", `${PROJECT}/requirements`);
    expect(screen.getByRole("link", { name: "Command Center" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByText("What are we trying to build?")).toBeInTheDocument();
  });
});
