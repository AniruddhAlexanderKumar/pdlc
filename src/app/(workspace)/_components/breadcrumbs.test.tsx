import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { Breadcrumbs } = await import("./breadcrumbs");
const { CrumbLabel } = await import("@/components/common/crumb-label");

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
    // The current segment is a plain announcement, not a link.
    expect(screen.getByText("Risks")).toHaveAttribute("aria-current", "page");
  });

  it("starts inside a project at the project — the sidebar already links the list", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/risks";
    render(<Breadcrumbs />);

    expect(screen.queryByRole("link", { name: /^Projects$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "proj1aaa…" })).toHaveAttribute(
      "href",
      "/projects/proj1aaaaaaaaaaaaaaaaaaa",
    );
  });

  it("keeps the Projects crumb on the project list itself", () => {
    pathname = "/projects";
    render(<Breadcrumbs />);

    expect(screen.getByText("Projects")).toHaveAttribute("aria-current", "page");
  });

  it("names a record by the identifier its page published, not by its database id", async () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements/reqaaaaaaaaaaaaaaaaaaaaa";
    window.history.pushState({}, "", pathname);
    render(
      <>
        <Breadcrumbs />
        <CrumbLabel title="SCN-REQ-001 — Maximum chamber pressure" />
      </>,
    );

    expect(await screen.findByText("SCN-REQ-001")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("reqaaaaa…")).not.toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });

  it("reads an enum path segment as a word", () => {
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/history/DESIGN_ITEM";
    render(<Breadcrumbs />);

    expect(screen.getByText("Design item")).toHaveAttribute("aria-current", "page");
  });

  it("names the project, not its id — the short id only stands in until the name loads", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ project: { id: "proj1aaaaaaaaaaaaaaaaaaa", name: "Upper Stage Propulsion" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    pathname = "/projects/proj1aaaaaaaaaaaaaaaaaaa/design-items";

    try {
      render(<Breadcrumbs />);

      expect(screen.getByRole("link", { name: "proj1aaa…" })).toBeInTheDocument();
      expect(await screen.findByRole("link", { name: "Upper Stage Propulsion" })).toHaveAttribute(
        "href",
        "/projects/proj1aaaaaaaaaaaaaaaaaaa",
      );
      // A module crumb uses the module's own name, as its tab does.
      expect(screen.getByText("Design items")).toHaveAttribute("aria-current", "page");
    } finally {
      vi.unstubAllGlobals();
    }
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