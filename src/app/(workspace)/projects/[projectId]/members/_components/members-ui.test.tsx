import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Members UI driven through the real API client with a faked `fetch`, so
 * request shapes and server-driven show/hide decisions are genuinely
 * exercised. Only the network is replaced. Every assertion here treats the
 * UI's hiding of a control as convenience — the point of these tests is
 * that the *request shape* is correct, never that hiding alone would be
 * sufficient security.
 */

const { MembersView } = await import("./members-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ORG_MEMBERS = [
  { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada Lovelace", email: "ada@example.test" },
  { id: "user2aaaaaaaaaaaaaaaaaaa", name: "Grace Hopper", email: "grace@example.test" },
];

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem1aaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT_ID,
    role: "ENGINEER",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    user: {
      id: "user1aaaaaaaaaaaaaaaaaaa",
      name: "Ada Lovelace",
      email: "ada@example.test",
      organizationRole: "MEMBER",
    },
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

/** Routes GET traffic; individual tests queue mutation responses via mockImplementationOnce. */
function routeGets(
  overrides: { members?: unknown[]; role?: string; isOrganizationOwner?: boolean } = {},
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/organization/members")) return ok({ members: ORG_MEMBERS });
    if (url.includes("/role")) {
      return ok({
        access: {
          role: overrides.role ?? "MANAGER",
          isOrganizationOwner: overrides.isOrganizationOwner ?? false,
        },
      });
    }
    if (url.includes("/members")) return ok({ members: overrides.members ?? [] });
    if (url.includes("/api/projects/")) return ok({ project: PROJECT });
    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MembersView", () => {
  it("shows a genuine empty state when there are no explicit members", async () => {
    routeGets();

    render(<MembersView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No explicit members yet")).toBeInTheDocument();
  });

  it("renders each member's project role and organization identity", async () => {
    routeGets({
      members: [
        member({ role: "MANAGER", user: { ...member().user, organizationRole: "OWNER" } }),
        member({ id: "mem2", role: "VIEWER", user: { ...member().user, id: "user2", name: "Grace Hopper", email: "grace@example.test" } }),
      ],
    });

    render(<MembersView projectId={PROJECT_ID} />);

    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows the caller's own role and its description", async () => {
    routeGets({ role: "REVIEWER" });

    render(<MembersView projectId={PROJECT_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/your role on this project/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText(/review\/approval actions only/i)).toBeInTheDocument();
  });

  it("a VIEWER sees no manage controls at all", async () => {
    routeGets({ role: "VIEWER", members: [member()] });

    render(<MembersView projectId={PROJECT_ID} />);

    await screen.findByText("Ada Lovelace");
    expect(screen.queryByText("Add a member")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("a MANAGER can add an existing organization member, sending userId and role", async () => {
    routeGets({ members: [] });
    const user = userEvent.setup();

    render(<MembersView projectId={PROJECT_ID} />);
    await screen.findByText("No explicit members yet");

    await user.selectOptions(screen.getByLabelText("Organization member"), "user2aaaaaaaaaaaaaaaaaaa");
    await user.selectOptions(screen.getByLabelText("Role"), "REVIEWER");

    fetchMock.mockImplementationOnce(async () => ok({ member: member({ id: "mem2" }) }));
    await user.click(screen.getByRole("button", { name: /add to project/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeDefined();
      const payload = JSON.parse(post![1].body);
      expect(payload).toEqual({ userId: "user2aaaaaaaaaaaaaaaaaaa", role: "REVIEWER" });
    });
  });

  it("a MANAGER can change a member's role inline", async () => {
    routeGets({ members: [member()] });
    const user = userEvent.setup();

    render(<MembersView projectId={PROJECT_ID} />);
    await screen.findByText("Ada Lovelace");

    fetchMock.mockImplementationOnce(async () => ok({ member: member({ role: "MANAGER" }) }));
    await user.selectOptions(screen.getByLabelText(/project role for ada lovelace/i), "MANAGER");

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(patch![1].body)).toEqual({ role: "MANAGER" });
    });
  });

  it("a MANAGER can remove a member", async () => {
    routeGets({ members: [member()] });
    const user = userEvent.setup();

    render(<MembersView projectId={PROJECT_ID} />);
    await screen.findByText("Ada Lovelace");

    fetchMock.mockImplementationOnce(async () => ok({ removed: true }));
    await user.click(screen.getByRole("button", { name: /remove ada lovelace/i }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(del).toBeDefined();
    });
  });

  it("only the organization owner sees the account-provisioning action", async () => {
    routeGets({ members: [], isOrganizationOwner: false });

    render(<MembersView projectId={PROJECT_ID} />);
    await screen.findByText("No explicit members yet");

    expect(screen.queryByRole("button", { name: /provision a new organization account/i })).not.toBeInTheDocument();
  });

  it("an organization owner can provision a new account, without sending an organization id", async () => {
    routeGets({ members: [], isOrganizationOwner: true });
    const user = userEvent.setup();

    render(<MembersView projectId={PROJECT_ID} />);
    await screen.findByRole("button", { name: /provision a new organization account/i });

    await user.click(screen.getByRole("button", { name: /provision a new organization account/i }));
    await user.type(await screen.findByLabelText(/^name/i), "Grace Hopper");
    await user.type(screen.getByLabelText(/^email/i), "grace@example.test");
    await user.type(screen.getByLabelText(/temporary password/i), "correct horse battery staple");

    fetchMock.mockImplementationOnce(async () =>
      ok({ member: { id: "user3", name: "Grace Hopper", email: "grace@example.test" } }),
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/organization/members") && init?.method === "POST",
      );
      expect(post).toBeDefined();
      const payload = JSON.parse(post![1].body);
      expect(payload).toEqual({
        name: "Grace Hopper",
        email: "grace@example.test",
        password: "correct horse battery staple",
      });
      expect(payload).not.toHaveProperty("organizationId");
    });
  });
});
