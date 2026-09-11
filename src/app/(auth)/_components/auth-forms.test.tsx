import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-in and sign-up form behavior, driving the real client auth module
 * through a faked `fetch`. Assertions cover what the user sees and what
 * leaves the browser — not implementation detail.
 */

const replace = vi.fn();
const refresh = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const { SignInForm } = await import("./sign-in-form");
const { SignUpForm } = await import("./sign-up-form");

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const IDENTITY = {
  user: { id: "user1", name: "Ada Lovelace", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1", name: "Example Aerospace" },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  searchParams.delete("next");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignInForm", () => {
  it("validates the fields before calling the API", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("An email address is required")).toBeInTheDocument();
    expect(screen.getByText("Your password is required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email client-side", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "some password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs in and navigates to the dashboard", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response(200, IDENTITY));
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "Ada@Example.test");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(replace).toHaveBeenCalledWith("/dashboard");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-in");
    // The email is normalized before it leaves the browser.
    expect(JSON.parse(init.body).email).toBe("ada@example.test");
  });

  it("returns to a safe path from ?next=, ignoring an off-site target", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response(200, IDENTITY));

    searchParams.set("next", "https://evil.example/steal");
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.test");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // An absolute URL must never become an open redirect.
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the server's authentication error and stays put", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response(401, {
        error: { code: "UNAUTHORIZED", message: "Incorrect email address or password." },
      }),
    );
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.test");
    await user.type(screen.getByLabelText(/password/i), "wrong password value");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email address or password.",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("never renders the submitted password", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response(401, { error: { code: "UNAUTHORIZED", message: "no" } }));
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/password/i), "super-secret-value");
    const passwordField = screen.getByLabelText(/password/i);

    // Masked input, and the value never appears as page text.
    expect(passwordField).toHaveAttribute("type", "password");
    expect(document.body.textContent).not.toContain("super-secret-value");
  });
});

describe("SignUpForm", () => {
  async function fillValidSignUp(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/organization name/i), "Example Aerospace");
    await user.type(screen.getByLabelText(/your name/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/work email/i), "ada@example.test");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
  }

  it("requires every field", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("An organization name is required")).toBeInTheDocument();
    expect(screen.getByText("Your name is required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the minimum password length client-side", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/organization name/i), "Example Aerospace");
    await user.type(screen.getByLabelText(/your name/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/work email/i), "ada@example.test");
    await user.type(screen.getByLabelText(/password/i), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers and lands on the dashboard already authenticated", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response(201, IDENTITY));
    render(<SignUpForm />);

    await fillValidSignUp(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/sign-up");
    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a duplicate-account conflict from the server", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response(409, {
        error: { code: "CONFLICT", message: "An account with that email address already exists." },
      }),
    );
    render(<SignUpForm />);

    await fillValidSignUp(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
