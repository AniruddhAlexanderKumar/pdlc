import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { requirementFlawTypeSchema } from "@/domain/requirement-quality";
import { InteractiveShowcase } from "./interactive-showcase";

/**
 * This used to run a `setTimeout` that returned the same hardcoded
 * paragraph regardless of what was typed — a demo that only looked live.
 * The test that matters most here is not "does it render some output" but
 * "does the output actually change when the input does", which a canned
 * string could never pass.
 */
describe("InteractiveShowcase", () => {
  it("starts with the pre-filled example already checked, flaws and all", async () => {
    render(<InteractiveShowcase />);

    expect(await screen.findByText(/flaw.*found/i)).toBeInTheDocument();
    // The pre-filled example says "fast enough" and "adequate" — both flagged.
    expect(screen.getByText("SUBJECTIVE_LANGUAGE")).toBeInTheDocument();
  });

  it("re-checks live as the text changes — this is not a scripted result", async () => {
    const user = userEvent.setup();
    render(<InteractiveShowcase />);
    const input = await screen.findByLabelText(/type or edit a requirement statement/i);

    await user.clear(input);
    await user.type(input, "The valve shall open in <= 45 ms at 120 +/- 0.5 bar.");

    expect(await screen.findByText(/no flaws found/i)).toBeInTheDocument();
  });

  it("states the real number of checks it runs, not a guessed one", async () => {
    render(<InteractiveShowcase />);

    const realCount = requirementFlawTypeSchema.options.length;
    expect(await screen.findByText(`${realCount} checks, run live`)).toBeInTheDocument();
  });

  it("renders the real relationship, traversal-limit and lifecycle explorers, not placeholders", async () => {
    const user = userEvent.setup();
    render(<InteractiveShowcase />);

    await user.click(screen.getByRole("tab", { name: /relationships/i }));
    expect(await screen.findByText(/every relationship it can have/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /traversal limits/i }));
    expect(await screen.findByText(/real, enforced cap/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /lifecycle rules/i }));
    expect(await screen.findByText(/the server actually allows/i)).toBeInTheDocument();
  });

  it("never claims a live backend connection it has not checked", async () => {
    render(<InteractiveShowcase />);
    await screen.findByText(/type or edit a requirement statement/i);

    expect(document.body.textContent).not.toMatch(/engine online|deterministic o\(v\+e\)/i);
  });
});
