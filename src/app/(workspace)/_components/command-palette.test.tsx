import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Driven for real against `PROJECT_MODULES` and `NAV_ITEMS` — the same data
 * the sidebar itself renders from — so a module added there is
 * automatically searchable here too, with no second list to keep in sync.
 */

const push = vi.fn();
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const { CommandPalette } = await import("./command-palette");

afterEach(() => {
  pathname = "/dashboard";
  window.localStorage.clear();
  push.mockReset();
});

describe("CommandPalette", () => {
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

  it("filters results as the query changes", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(/jump to a module/i), "risk");

    expect(screen.getAllByText("Risks").length).toBeGreaterThan(0);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("Enter navigates to the highlighted result", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/dashboard";
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(/jump to a module/i), "risks");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/projects/proj1aaaaaaaaaaaaaaaaaaa/risks");
  });

  it("shows an honest empty state for a query matching nothing", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /jump to/i }));

    await user.type(screen.getByLabelText(/jump to a module/i), "xyznonexistent");

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
