import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { InteractiveOnboardingTour } from "./interactive-onboarding-tour";

/**
 * The first-sign-in tour.
 *
 * "Shown the first time someone signs in" was an explicit requirement, and
 * shipped with no test. The regression that prompted these was worse than a
 * missing tour: closing it with ✕ was remembered only in component memory,
 * so it reappeared on every refresh and every new tab — found by walking
 * the product as a newcomer and meeting it again one page later.
 */

const FLAG = "pdlc:onboarding-completed";

afterEach(() => localStorage.clear());

function tourIsOpen(): boolean {
  return screen.queryByRole("dialog") !== null;
}

describe("InteractiveOnboardingTour", () => {
  it("opens on its own for someone who has never seen it", () => {
    render(<InteractiveOnboardingTour />);
    expect(tourIsOpen()).toBe(true);
  });

  it("stays closed for someone who has already been through it", () => {
    localStorage.setItem(FLAG, "1");
    render(<InteractiveOnboardingTour />);
    expect(tourIsOpen()).toBe(false);
  });

  /** The regression: closing must survive a reload, not just this render. */
  it("stays closed after a reload once closed with Escape", async () => {
    const user = userEvent.setup();
    const first = render(<InteractiveOnboardingTour />);

    await user.keyboard("{Escape}");
    expect(tourIsOpen()).toBe(false);

    first.unmount();
    render(<InteractiveOnboardingTour />);
    expect(tourIsOpen()).toBe(false);
  });

  it("stays closed after a reload once skipped", async () => {
    const user = userEvent.setup();
    const first = render(<InteractiveOnboardingTour />);

    await user.click(screen.getByRole("button", { name: "Skip tour" }));

    first.unmount();
    render(<InteractiveOnboardingTour />);
    expect(tourIsOpen()).toBe(false);
  });

  it("can always be replayed from Help, even after being closed", () => {
    localStorage.setItem(FLAG, "1");
    render(<InteractiveOnboardingTour />);
    expect(tourIsOpen()).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("pdlc:open-onboarding-tour"));
    });

    expect(tourIsOpen()).toBe(true);
  });

  it("tells the reader where to find it again", async () => {
    const user = userEvent.setup();
    render(<InteractiveOnboardingTour />);

    // Walk to the last step.
    while (screen.queryByRole("button", { name: /next/i })) {
      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    expect(screen.getByText(/Replay the tour/)).toBeInTheDocument();
  });
});
