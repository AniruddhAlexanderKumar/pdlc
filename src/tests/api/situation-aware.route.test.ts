// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/server/errors";

/**
 * The situation-aware assistant's route.
 *
 * It shipped without tests, and with three defects this file now pins down:
 * it hand-rolled its responses instead of using `errorResponse` (returning
 * internal exception text to the client), it parsed its body by hand
 * (accepting any unknown field), and it reported the vestigial `user.role`
 * as the reader's access role instead of the `organizationRole` that is
 * actually enforced.
 *
 * Nothing here calls a model, and the assertion below that the same input
 * returns the same output is deliberate: this endpoint is named `/ai/` but
 * is a pure function of the route table, and that is what keeps it
 * compatible with a product that refuses inferred engineering judgment.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: {
    id: "user1aaaaaaaaaaaaaaaaaaa",
    name: "Ada",
    email: "ada@example.test",
    role: "ADMIN",
    organizationRole: "EXECUTIVE",
  },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

const authContext = await import("@/server/auth/context");
const route = await import("@/app/api/ai/situation-aware/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/situation-aware", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("POST /api/ai/situation-aware", () => {
  it("answers for the page the reader names", async () => {
    const response = await route.POST(post({ pathname: "/projects/p1/requirements" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.situation.moduleCategory).toBe("Define");
    expect(body.analysis.answer).toBeTruthy();
  });

  it("401s with no session, and never reaches the route table", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await route.POST(post({ pathname: "/dashboard" }));

    expect(response.status).toBe(401);
  });

  /** The defect that mattered: internal exception text reaching the client. */
  it("returns a sanitized error, never raw exception text", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new Error("connection string postgres://user:password@host/db refused"),
    );

    const response = await route.POST(post({ pathname: "/dashboard" }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).not.toContain("postgres://");
    expect(body).not.toContain("password");
    expect(body).not.toContain("details");
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    const response = await route.POST(post({ pathname: "/dashboard", escalate: true }));
    expect(response.status).toBe(400);
  });

  it("rejects a message longer than the schema allows", async () => {
    const response = await route.POST(post({ pathname: "/dashboard", userMessage: "x".repeat(2001) }));
    expect(response.status).toBe(400);
  });

  it("falls back to the dashboard when no pathname is given", async () => {
    const response = await route.POST(post({}));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      situation: { pathname: "/dashboard" },
    });
  });

  /**
   * `user.role` is vestigial — ARCHITECTURE.md records it as "carried on the
   * session, never branched on anywhere in server code". Reporting it as the
   * reader's authority named a role that grants nothing.
   */
  it("reports the enforced organization role, not the vestigial user.role", async () => {
    const body = await (await route.POST(post({ pathname: "/dashboard" }))).json();

    expect(body.situation.userRole).toBe("EXECUTIVE");
    expect(body.situation.userRole).not.toBe("ADMIN");
  });

  it("is deterministic — the same request twice gives the same answer", async () => {
    const first = await (await route.POST(post({ pathname: "/projects/p1/risks" }))).json();
    const second = await (await route.POST(post({ pathname: "/projects/p1/risks" }))).json();

    expect(second).toEqual(first);
  });
});
