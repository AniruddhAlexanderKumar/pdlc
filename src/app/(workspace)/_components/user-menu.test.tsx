import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const { UserMenu, initials } = await import("./user-menu");

const IDENTITY = {
  user: { id: "user1", name: "Ada Lovelace", email: "ada@example.test", role: "ADMIN", organizationRole: "OWNER" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("shows the signed-in user without exposing internal identifiers", async () => {
    const user = userEvent.setup();
    render(<UserMenu identity={IDENTITY} />);

    // Collapsed, it is just the avatar — named for a screen reader.
    await user.click(screen.getByRole("button", { name: "Account: Ada Lovelace" }));

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();
    // Database ids are not surfaced in the UI.
    expect(document.body.textContent).not.toContain(IDENTITY.organization.id);
    expect(document.body.textContent).not.toContain(IDENTITY.user.id);
  });

  it("signs out through the API and returns to sign-in", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ signedOut: true }) });

    render(<UserMenu identity={IDENTITY} />);
    await user.click(screen.getByRole("button", { name: /^Account/ }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    // POST, so the server can invalidate the session row — not a client-side
    // cookie wipe.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(refresh).toHaveBeenCalled();
  });

  it("still leaves the workspace when the sign-out request fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("network down"));

    render(<UserMenu identity={IDENTITY} />);
    await user.click(screen.getByRole("button", { name: /^Account/ }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("holds settings and the organization profile, one click from any page", async () => {
    const user = userEvent.setup();
    render(<UserMenu identity={IDENTITY} />);
    await user.click(screen.getByRole("button", { name: /^Account/ }));

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Example Aerospace" })).toHaveAttribute("href", "/organization");
  });
});

describe("initials", () => {
  it("takes the first and last word's first letter", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Grace Brewster Hopper")).toBe("GH");
    expect(initials("Plato")).toBe("P");
  });

  it("skips parentheticals and punctuation, so neither becomes an initial", () => {
    expect(initials("Demo Program Owner (fictional)")).toBe("DO");
    expect(initials("Ada Lovelace (Admin)")).toBe("AL");
    expect(initials("Jean-Luc O'Neil")).toBe("JO");
    expect(initials("— ()")).toBe("?");
  });
});
