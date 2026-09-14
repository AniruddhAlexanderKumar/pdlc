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
  it("links to the Help page", () => {
    render(<TopBar identity={IDENTITY} />);

    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
  });

  it("links the organization name to its profile page", () => {
    render(<TopBar identity={IDENTITY} />);

    expect(screen.getByRole("link", { name: "Example Aerospace" })).toHaveAttribute(
      "href",
      "/organization",
    );
  });
});
