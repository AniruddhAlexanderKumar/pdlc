import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { CommandPalette } = await import("./command-palette");

describe("CommandPalette", () => {
  it("opens on click and shows every real doc page when the query is empty", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.click(screen.getByRole("button", { name: /search docs/i }));

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Concepts")).toBeInTheDocument();
  });

  it("opens on Ctrl+K from anywhere, with no click at all", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("filters results as the query changes", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /search docs/i }));

    await user.type(screen.getByLabelText(/search documentation/i), "argon2id");

    expect(screen.getAllByText("Security").length).toBeGreaterThan(0);
    expect(screen.queryByText("Release notes")).not.toBeInTheDocument();
  });

  it("Enter navigates to the highlighted result", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /search docs/i }));

    await user.type(screen.getByLabelText(/search documentation/i), "security");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/docs/security");
  });

  it("shows an honest empty state for a query matching nothing", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /search docs/i }));

    await user.type(screen.getByLabelText(/search documentation/i), "xyznonexistent");

    expect(screen.getByText(/no pages match/i)).toBeInTheDocument();
  });
});
