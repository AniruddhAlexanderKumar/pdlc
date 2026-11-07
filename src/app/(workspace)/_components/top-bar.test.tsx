import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

const { TopBar } = await import("./top-bar");

const IDENTITY = {
  user: { id: "user1", name: "Ada Lovelace", email: "ada@example.test", role: "ADMIN", organizationRole: "OWNER" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

describe("TopBar", () => {
  /**
   * Help is one button opening a menu, not a link straight to `/help`. It
   * used to be four unlabelled icons — assistant, guides, tour, help centre
   * — and the help centre is now one option inside the menu rather than a
   * peer of the other three. `HelpMenu` covers what the menu contains.
   */
  it("offers exactly one help control, not one per kind of help", () => {
    render(<TopBar identity={IDENTITY} />);

    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /onboarding tour/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /step-by-step/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assistant/i })).not.toBeInTheDocument();
  });

  it("links the organization name to its profile page", () => {
    render(<TopBar identity={IDENTITY} />);

    expect(screen.getByRole("link", { name: "Example Aerospace" })).toHaveAttribute(
      "href",
      "/organization",
    );
  });
});
