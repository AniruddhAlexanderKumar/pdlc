// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Route-level behavior for the auth endpoints: status codes, what reaches the
 * cookie, and what is allowed into a response body. The service is faked here
 * — its own behavior is covered in auth.service.test.ts.
 */

const IDENTITY = {
  user: {
    id: "user1aaaaaaaaaaaaaaaaaaa",
    name: "Ada Lovelace",
    email: "ada@example.test",
    role: "ADMIN",
  },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

const SESSION = { token: "raw-session-token", expiresAt: new Date("2026-07-01T00:00:00.000Z") };

const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/server/services/auth.service", () => ({
  register: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/server/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  toIdentity: vi.fn((context: { user: unknown; organization: unknown }) => ({
    user: context.user,
    organization: context.organization,
  })),
}));

const authService = await import("@/server/services/auth.service");
const authContext = await import("@/server/auth/context");
const signUpRoute = await import("@/app/api/auth/sign-up/route");
const signInRoute = await import("@/app/api/auth/sign-in/route");
const signOutRoute = await import("@/app/api/auth/sign-out/route");
const sessionRoute = await import("@/app/api/auth/session/route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "raw-session-token" });
});

describe("POST /api/auth/sign-up", () => {
  it("registers and sets an HttpOnly session cookie", async () => {
    vi.mocked(authService.register).mockResolvedValue({ identity: IDENTITY, session: SESSION });

    const response = await signUpRoute.POST(
      jsonRequest({
        name: "Ada Lovelace",
        email: "ada@example.test",
        password: "correct horse battery staple",
        organizationName: "Example Aerospace",
      }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).user.email).toBe("ada@example.test");

    const [cookieName, cookieValue, options] = cookieStore.set.mock.calls[0]!;
    expect(cookieName).toBe("pdlc_session");
    expect(cookieValue).toBe(SESSION.token);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.expires).toEqual(SESSION.expiresAt);
  });

  it("returns 409 for an email that is already registered", async () => {
    vi.mocked(authService.register).mockRejectedValue(
      new ConflictError("An account with that email address already exists."),
    );

    const response = await signUpRoute.POST(jsonRequest({ email: "taken@example.test" }));

    expect(response.status).toBe(409);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    const response = await signUpRoute.POST(jsonRequest("{not json"));

    expect(response.status).toBe(400);
    expect(authService.register).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/sign-in", () => {
  it("authenticates and sets the session cookie", async () => {
    vi.mocked(authService.signIn).mockResolvedValue({ identity: IDENTITY, session: SESSION });

    const response = await signInRoute.POST(
      jsonRequest({ email: "ada@example.test", password: "correct horse battery staple" }),
    );

    expect(response.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "pdlc_session",
      SESSION.token,
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("returns a generic 401 and sets no cookie on bad credentials", async () => {
    vi.mocked(authService.signIn).mockRejectedValue(
      new UnauthorizedError("Incorrect email address or password."),
    );

    const response = await signInRoute.POST(
      jsonRequest({ email: "ada@example.test", password: "wrong password value" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Incorrect email address or password.");
    // Nothing in the response distinguishes "no such account" from "wrong password".
    expect(JSON.stringify(body)).not.toMatch(/exist|unknown|not found/i);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("never echoes the submitted password back", async () => {
    vi.mocked(authService.signIn).mockRejectedValue(new UnauthorizedError());

    const response = await signInRoute.POST(
      jsonRequest({ email: "ada@example.test", password: "super-secret-value" }),
    );

    expect(JSON.stringify(await response.json())).not.toContain("super-secret-value");
  });
});

describe("POST /api/auth/sign-out", () => {
  it("invalidates the session server-side and clears the cookie", async () => {
    const response = await signOutRoute.POST();

    expect(response.status).toBe(200);
    expect(authService.signOut).toHaveBeenCalledWith("raw-session-token");

    const [name, value, options] = cookieStore.set.mock.calls[0]!;
    expect(name).toBe("pdlc_session");
    expect(value).toBe("");
    expect(options.maxAge).toBe(0);
  });

  it("succeeds even with no session cookie present", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const response = await signOutRoute.POST();

    expect(response.status).toBe(200);
    expect(authService.signOut).toHaveBeenCalledWith(undefined);
  });
});

describe("GET /api/auth/session", () => {
  it("returns the safe identity when authenticated", async () => {
    vi.mocked(authContext.getAuthenticatedContext).mockResolvedValue({
      ...IDENTITY,
      organizationId: IDENTITY.organization.id,
      actorId: IDENTITY.user.id,
      sessionId: "sess1aaaaaaaaaaaaaaaaaa",
    });

    const response = await sessionRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.identity.user.email).toBe("ada@example.test");
    // No session id, token or credential material crosses the wire.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sess1aaaaaaaaaaaaaaaaaa");
    expect(serialized).not.toMatch(/token|passwordHash/i);
  });

  it("returns a null identity when unauthenticated", async () => {
    vi.mocked(authContext.getAuthenticatedContext).mockResolvedValue(null);

    const response = await sessionRoute.GET();

    expect(response.status).toBe(200);
    expect((await response.json()).identity).toBeNull();
  });
});
