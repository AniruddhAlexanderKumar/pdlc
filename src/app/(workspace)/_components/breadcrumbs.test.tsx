import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { Breadcrumbs } = await import("./breadcrumbs");

const writeText = vi.fn();

afterEach(() => {
  pathname = "/dashboard";
  writeText.mockReset();
  // Remove any clipboard we installed so user-event can re-install its
  // own stub cleanly on the next setup() call.
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    configurable: true,
  });
});

describe("Breadcrumbs", () => {
  it("renders the home link and a crumb for each path segment", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks";
    render(<Breadcrumbs />);

    expect(screen.getByRole("link", { name: "Dashboard home" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: /^Projects$/ })).toHaveAttribute(
      "href",
      "/projects",
    );
    // The current segment is a plain announcement, not a link.
    expect(screen.getByText("Risks")).toHaveAttribute("aria-current", "page");
  });

  it("copies the current path to the clipboard and shows transient feedback", async () => {
    writeText.mockResolvedValue(undefined);
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks";
    const user = userEvent.setup();
    render(<Breadcrumbs />);
    // Stub after setup()/render(): user-event installs its own clipboard
    // stub on navigator, so ours must shadow it right before the click.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    await user.click(screen.getByRole("button", { name: "Copy current path" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(pathname));
    expect(screen.getByRole("button", { name: "Path copied" })).toBeInTheDocument();

    // Give the real 1500ms feedback timer a chance to fire, then assert revert.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(screen.getByRole("button", { name: "Copy current path" })).toBeInTheDocument();
  });

  it("stays inert rather than throwing when the clipboard rejects", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    pathname = "/dashboard";
    const user = userEvent.setup();
    render(<Breadcrumbs />);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    await user.click(screen.getByRole("button", { name: "Copy current path" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/dashboard"));
    // No checkmark swapped in — the button remains in its copy state.
    expect(screen.getByRole("button", { name: "Copy current path" })).toBeInTheDocument();
  });

  it("is inert when the clipboard is not present at all", async () => {
    const user = userEvent.setup();
    render(<Breadcrumbs />);
    // user-event installs its own clipboard stub; explicitly remove it
    // so the component sees an undefined clipboard (same as a real browser
    // without clipboard support) and falls through the try/catch inertly.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    await user.click(screen.getByRole("button", { name: "Copy current path" }));

    // navigator.clipboard is undefined → TypeError caught; no state change.
    expect(screen.getByRole("button", { name: "Copy current path" })).toBeInTheDocument();
  });
});