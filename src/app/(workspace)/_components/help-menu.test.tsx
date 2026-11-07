import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The single help entry point.
 *
 * These tests exist mostly to keep it single. The top bar previously
 * carried four unlabelled icons opening four overlapping surfaces, and the
 * failure mode to guard against is not that any one of them breaks — it is
 * that a fifth gets added next to them.
 */

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { HelpMenu } = await import("./help-menu");

afterEach(() => {
  pathname = "/dashboard";
  vi.restoreAllMocks();
});

async function openMenu() {
  const user = userEvent.setup();
  render(<HelpMenu />);
  await user.click(screen.getByRole("button", { name: "Help" }));
  return user;
}

describe("HelpMenu", () => {
  it("is one button, not four", () => {
    render(<HelpMenu />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("names each kind of help by what it answers", async () => {
    await openMenu();

    expect(await screen.findByText("Explain this page")).toBeInTheDocument();
    expect(screen.getByText("Step-by-step guides")).toBeInTheDocument();
    expect(screen.getByText("Replay the tour")).toBeInTheDocument();
    expect(screen.getByText("Help centre")).toBeInTheDocument();
  });

  it("opens with where the reader actually is", async () => {
    pathname = "/projects/p1/requirements";
    await openMenu();

    expect(await screen.findByText("You are here")).toBeInTheDocument();
    expect(screen.getByText(/Requirements/)).toBeInTheDocument();
  });

  it("asks the assistant to explain the page", async () => {
    const dispatched = vi.spyOn(window, "dispatchEvent");
    const user = await openMenu();

    await user.click(await screen.findByText("Explain this page"));

    expect(dispatched.mock.calls.some(([e]) => e.type === "pdlc:open-ai-assistant")).toBe(true);
  });

  it("replays the tour on request", async () => {
    const dispatched = vi.spyOn(window, "dispatchEvent");
    const user = await openMenu();

    await user.click(await screen.findByText("Replay the tour"));

    expect(dispatched.mock.calls.some(([e]) => e.type === "pdlc:open-onboarding-tour")).toBe(true);
  });

  /** The one behaviour worth keeping from the floating panel this replaced. */
  it("opens the guide already filtered to the section covering this page", async () => {
    pathname = "/projects/p1/sentinel";
    const dispatched = vi.spyOn(window, "dispatchEvent");
    const user = await openMenu();

    await user.click(await screen.findByText("Step-by-step guides"));

    const event = dispatched.mock.calls
      .map(([e]) => e)
      .find((e): e is CustomEvent => e.type === "pdlc:open-step-by-step-guide");
    expect(event?.detail).toBe("sentinel");
  });

  it("opens the guide unfiltered where no section covers the page", async () => {
    pathname = "/dashboard";
    const dispatched = vi.spyOn(window, "dispatchEvent");
    const user = await openMenu();

    await user.click(await screen.findByText("Step-by-step guides"));

    const event = dispatched.mock.calls
      .map(([e]) => e)
      .find((e) => e.type === "pdlc:open-step-by-step-guide");
    expect(event).toBeDefined();
    expect((event as CustomEvent).detail ?? null).toBeNull();
  });

  it("links to the help centre rather than opening it in place", async () => {
    await openMenu();

    expect(await screen.findByRole("link", { name: /Help centre/ })).toHaveAttribute("href", "/help");
  });
});
