import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/domain/search";
import type { SearchState } from "@/lib/api/search";

/**
 * Driven for real against `PROJECT_MODULES` and `NAV_ITEMS` — the same data
 * the sidebar itself renders from — so a module added there is
 * automatically reachable here too, with no second list to keep in sync.
 *
 * The search half is faked at the hook, not the network: what matters here
 * is how found records are ordered against navigation and what a row says,
 * and the query itself is proven against real PostgreSQL in
 * `src/tests/integration/search.test.ts`.
 */

const push = vi.fn();
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

let searchState: SearchState = { phase: "idle" };
vi.mock("@/lib/api/search", () => ({ useSearch: () => searchState }));

const { CommandPalette } = await import("./command-palette");

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    type: "REQUIREMENT",
    id: "req1aaaaaaaaaaaaaaaaaaaa",
    identifier: "REQ-001",
    title: "Thrust vector control authority",
    status: "APPROVED",
    projectId: "proj1aaaaaaaaaaaaaaaaaaa",
    projectName: "Upper Stage",
    ownerName: "Ada Lovelace",
    updatedAt: "2026-02-01T00:00:00.000Z",
    matchKind: "TEXT",
    ...overrides,
  };
}

function ready(results: SearchResult[], truncated = false): SearchState {
  return { phase: "ready", data: { query: "q", results, truncated } };
}

afterEach(() => {
  pathname = "/dashboard";
  searchState = { phase: "idle" };
  window.localStorage.clear();
  push.mockReset();
});

const INPUT = /search records, jump to a page/i;

describe("CommandPalette navigation", () => {
  it("opens on click and lists the global destinations outside any project", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getAllByText("Requirements").length).toBeGreaterThan(0);
    // Project-scoped-only modules have nowhere to point outside a project.
    expect(screen.queryByText("Command Center")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K from anywhere, with no click at all", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("lists this project's own modules once inside one, including Command Center", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements";
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getAllByText("Traceability").length).toBeGreaterThan(0);
  });

  it("filters navigation as the query changes", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(INPUT), "risk");

    expect(screen.getAllByText("Risks").length).toBeGreaterThan(0);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("Enter navigates to the highlighted result", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/dashboard";
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(INPUT), "risks");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/projects/proj1aaaaaaaaaaaaaaaaaaa/risks");
  });

  it("shows an honest empty state for a query matching nothing", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(INPUT), "xyznonexistent");

    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  it("a module removed via nav customization does not appear — removed means removed everywhere, not just the sidebar", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements";
    window.localStorage.setItem(
      "pdlc:nav-customization",
      JSON.stringify({ hidden: ["/risks"], pinned: [] }),
    );
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.queryByText("Risks")).not.toBeInTheDocument();
  });
});

describe("CommandPalette search", () => {
  it("shows a found record with the identifier, project and status that tell two apart", async () => {
    searchState = ready([result()]);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.getByText("Thrust vector control authority")).toBeInTheDocument();
    expect(screen.getByText(/REQ-001 · Upper Stage · APPROVED/)).toBeInTheDocument();
  });

  it("opens the record itself, not a list page", async () => {
    searchState = ready([result()]);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.click(screen.getByText("Thrust vector control authority"));

    expect(push).toHaveBeenCalledWith(
      "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements/req1aaaaaaaaaaaaaaaaaaaa",
    );
  });

  /** Someone who types an identifier is not looking for a module. */
  it("puts an exact identifier match above every navigation entry", async () => {
    searchState = ready([result({ matchKind: "IDENTIFIER_EXACT" })]);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Thrust vector control authority");
    expect(options[0]).toHaveTextContent("Exact match");
  });

  it("keeps navigation above an ordinary text match, which is only a guess", async () => {
    searchState = ready([result({ matchKind: "TEXT" })]);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Dashboard");
    expect(options.at(-1)).toHaveTextContent("Thrust vector control authority");
  });

  it("never shows a relevance score next to a record", async () => {
    searchState = ready([result({ matchKind: "IDENTIFIER_PARTIAL" })]);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).not.toMatch(/\d+\s*%|score|relevance|rank/i);
  });

  it("says plainly when there are more matches than it is showing", async () => {
    searchState = ready([result()], true);
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.getByText(/more records match than are shown/i)).toBeInTheDocument();
  });

  it("surfaces a search failure instead of rendering an empty result set as 'nothing found'", async () => {
    searchState = { phase: "error", message: "Search failed." };
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Search failed.");
  });

  it("tells the reader a search is running", async () => {
    searchState = { phase: "searching" };
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Searching…");
  });
});

describe("CommandPalette create", () => {
  const PROJECT = "/projects/proj1aaaaaaaaaaaaaaaaaaa";

  it("keeps Create entries out of the opening list, so it stays short", async () => {
    pathname = PROJECT;
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    expect(screen.queryByRole("option", { name: /^New risk/ })).not.toBeInTheDocument();
  });

  it("offers every record type as a New entry once you type, opening that page's form", async () => {
    pathname = PROJECT;
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));
    await user.type(screen.getByRole("textbox", { name: INPUT }), "new");

    expect(screen.getByRole("option", { name: /^New requirement/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^New change request/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^New project/ })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /^New risk/ }));
    expect(push).toHaveBeenCalledWith(`${PROJECT}/risks?new=1`);
  });

  it("uses the organization's own word for a renamed record type", async () => {
    pathname = PROJECT;
    window.localStorage.clear();
    const user = userEvent.setup();
    const { TerminologyProvider } = await import("./terminology-context");
    render(
      <TerminologyProvider overrides={{ risk: "Hazards" }}>
        <CommandPalette />
      </TerminologyProvider>,
    );
    await user.click(screen.getByRole("button", { name: /jump to/i }));
    await user.type(screen.getByRole("textbox", { name: INPUT }), "hazard");

    expect(screen.getByRole("option", { name: /^Add to Hazards/ })).toBeInTheDocument();
  });

  it("offers only New project outside a project", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));
    await user.type(screen.getByRole("textbox", { name: INPUT }), "new");

    expect(screen.getByRole("option", { name: /^New project/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^New risk/ })).not.toBeInTheDocument();
  });
});
