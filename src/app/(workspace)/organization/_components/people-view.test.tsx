import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Driven through the real API client with a faked `fetch`, so the request
 * an owner's "Add a person" actually sends is exercised rather than mocked
 * away.
 */

const { PeopleView } = await import("./people-view");

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const PEOPLE = [
  {
    id: "user1",
    name: "Ada Lovelace",
    email: "ada@example.test",
    organizationRole: "OWNER",
    // Realistic: an owner needs no membership rows to reach every project.
    joinedAt: "2026-01-01T00:00:00.000Z",
    projectCount: 0,
  },
  {
    id: "user2",
    name: "Grace Hopper",
    email: "grace@example.test",
    organizationRole: "MEMBER",
    joinedAt: "2026-02-01T00:00:00.000Z",
    projectCount: 2,
  },
  {
    id: "user3",
    name: "Katherine Johnson",
    email: "katherine@example.test",
    organizationRole: "MEMBER",
    joinedAt: "2026-03-01T00:00:00.000Z",
    projectCount: 0,
  },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok({ members: PEOPLE }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PeopleView", () => {
  it("lists everyone in the organization with their role", async () => {
    render(<PeopleView isOwner={false} />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("grace@example.test")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("says plainly when someone has no project access, rather than showing a bare zero", async () => {
    render(<PeopleView isOwner={false} />);

    expect(await screen.findByText("No project access")).toBeInTheDocument();
    expect(screen.getByText("2 projects")).toBeInTheDocument();
  });

  it("never describes an owner by their membership count — an owner reaches every project without one", async () => {
    fetchMock.mockImplementation(async () =>
      ok({
        members: [
          {
            id: "user1",
            name: "Ada Lovelace",
            email: "ada@example.test",
            organizationRole: "OWNER",
            joinedAt: "2026-01-01T00:00:00.000Z",
            // The realistic case: an owner has no explicit membership rows
            // at all, because they never need one.
            projectCount: 0,
          },
        ],
      }),
    );

    render(<PeopleView isOwner />);

    expect(await screen.findByText("All projects")).toBeInTheDocument();
    expect(screen.queryByText("No project access")).not.toBeInTheDocument();
  });

  it("does not offer Add a person to a non-owner — the server enforces this regardless", async () => {
    render(<PeopleView isOwner={false} />);

    await screen.findByText("Ada Lovelace");
    expect(screen.queryByRole("button", { name: /add a person/i })).not.toBeInTheDocument();
  });

  it("an owner can add a person, and the request carries exactly what was typed", async () => {
    const user = userEvent.setup();
    render(<PeopleView isOwner />);

    await user.click(await screen.findByRole("button", { name: /add a person/i }));

    await user.type(screen.getByLabelText("Name"), "Katherine Johnson");
    await user.type(screen.getByLabelText("Email"), "katherine@example.test");
    await user.type(screen.getByLabelText("First password"), "a-real-password-1");
    await user.click(screen.getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => {
          const requestInit = init as RequestInit | undefined;
          if (requestInit?.method !== "POST" || !requestInit.body) return false;
          const body = JSON.parse(String(requestInit.body));
          return body.email === "katherine@example.test" && body.name === "Katherine Johnson";
        }),
      ).toBe(true);
    });
  });

  it("tells the owner there is no invitation email, rather than letting them wait for one", async () => {
    const user = userEvent.setup();
    render(<PeopleView isOwner />);

    await user.click(await screen.findByRole("button", { name: /add a person/i }));

    expect(screen.getByText(/no invitation email/i)).toBeInTheDocument();
  });

  it("surfaces a server error instead of silently failing", async () => {
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: "CONFLICT", message: "An account with that email address already exists." },
          }),
        } as unknown as Response;
      }
      return ok({ members: PEOPLE });
    });

    const user = userEvent.setup();
    render(<PeopleView isOwner />);

    await user.click(await screen.findByRole("button", { name: /add a person/i }));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("First password"), "a-real-password-1");
    await user.click(screen.getByRole("button", { name: "Add person" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
