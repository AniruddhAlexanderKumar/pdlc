import { render, screen, waitFor, within } from "@testing-library/react";
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

const { MobileNav, Sidebar } = await import("./sidebar");

const PROJECT = "/projects/proj1aaaaaaaaaaaaaaaaaaa";

afterEach(() => {
  pathname = "/dashboard";
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

/** A progress response as `/api/projects/:id/progress` sends it — only the fields the sidebar reads. */
function stubProgress(states: Record<string, string>, next: string) {
  const steps = Object.entries(states).map(([stage, state]) => ({ stage, state }));
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ progress: { facts: {}, steps, next: steps.find((step) => step.stage === next) } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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

  it("marks each step with its real progress, and tags the one to do next", async () => {
    pathname = PROJECT;
    stubProgress(
      {
        DEFINE: "READY",
        DESIGN: "NEEDS_REVIEW",
        DECIDE: "IN_PROGRESS",
        VERIFY: "NOT_STARTED",
        CONTROL: "NOT_STARTED",
        RELEASE: "NOT_STARTED",
      },
      "DESIGN",
    );
    render(<Sidebar />);

    expect(
      await screen.findByRole("link", { name: "Step 1: Define — What are we trying to build? (Ready)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Step 2: Design .*\(Needs review, next step\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Step 3: Decide .*\(In progress\)$/ })).toBeInTheDocument();
    expect(screen.getAllByText("Next")).toHaveLength(1);
  });

  it("tags nothing as next once every step is ready", async () => {
    pathname = PROJECT;
    const ready = { DEFINE: "READY", DESIGN: "READY", DECIDE: "READY", VERIFY: "READY", CONTROL: "READY", RELEASE: "READY" };
    const fetchMock = stubProgress(ready, "RELEASE");
    render(<Sidebar />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByRole("link", { name: /^Step 6: .*\(Ready\)$/ })).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("leaves the steps unmarked, not guessed, when progress cannot be loaded", async () => {
    pathname = PROJECT;
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Sidebar />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Step 4: Verify — How do we know it works?" })).toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("remembers being collapsed", async () => {
    pathname = PROJECT;
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar />);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    unmount();

    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});

describe("MobileNav", () => {
  it("opens the same navigation in a drawer, and closes itself when you go somewhere", async () => {
    pathname = PROJECT;
    const user = userEvent.setup();
    const { rerender } = render(<MobileNav organizationName="Example Aerospace" />);

    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("link", { name: /^Step 1: Define/ })).toHaveAttribute(
      "href",
      `${PROJECT}/requirements`,
    );
    expect(within(drawer).getByRole("link", { name: "Example Aerospace" })).toHaveAttribute("href", "/organization");

    // Tapping a link navigates; the drawer must not still be open on the next page.
    pathname = `${PROJECT}/requirements`;
    rerender(<MobileNav organizationName="Example Aerospace" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
