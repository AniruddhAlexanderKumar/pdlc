import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsView } from "./settings-view";

/**
 * Every preference here is per-browser (localStorage) — driven through the
 * real hooks (`useTheme`, `useStoredFlag`, `useNavCustomization`), not a
 * mock, since there is no server round trip to fake.
 */

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsView", () => {
  it("defaults to Match system, with no data-theme override", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.getByRole("radio", { name: /Match system/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("choosing Dark sets data-theme on the document", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("toggling Simplify persists the same preference the sidebar itself reads", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    const checkbox = screen.getByRole("checkbox", { name: "Simplify project navigation" });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(window.localStorage.getItem("pdlc:nav-simplified")).toBe("1");
  });

  it("removing a module marks it removed, with no Reset button until something changes", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Risks" }));

    expect(screen.getByRole("button", { name: "Show Risks" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("pinning a module shows a Pinned badge next to it", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("button", { name: "Pin Suppliers" }));

    expect(screen.getByRole("button", { name: "Unpin Suppliers" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Pinned")).not.toHaveLength(0);
  });

  it("pinning a removed module un-removes it — the two states are mutually exclusive", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("button", { name: "Remove Risks" }));
    await user.click(screen.getByRole("button", { name: "Pin Risks" }));

    expect(screen.getByRole("button", { name: "Unpin Risks" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Remove Risks" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Reset clears every removal and pin", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("button", { name: "Remove Risks" }));
    await user.click(screen.getByRole("button", { name: "Pin Suppliers" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("button", { name: "Remove Risks" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Pin Suppliers" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("lists Suppliers and Members under an explicit 'not shown by default' group, not silently omitted", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.getByText(/not shown by default/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin Suppliers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin Members" })).toBeInTheDocument();
  });

  it("Command Center is never offered as customizable", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.queryByRole("button", { name: /Command Center/ })).not.toBeInTheDocument();
  });

  it("tells a non-owner they cannot change organization-wide settings", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.getByText(/Only an organization owner can change them/)).toBeInTheDocument();
  });

  it("does not scold an owner about a permission they have", () => {
    render(<SettingsView isOwner />);
    expect(screen.queryByText(/Only an organization owner can change them/)).not.toBeInTheDocument();
  });

  it("groups personal preferences under a 'Personalization' heading, separate from the organization-wide one", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.getByRole("heading", { name: "Personalization" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organization-wide" })).toBeInTheDocument();
  });

  it("defaults Layout to Comfortable", () => {
    render(<SettingsView isOwner={false} />);
    expect(screen.getByRole("radio", { name: /Comfortable/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Compact/ })).toHaveAttribute("aria-checked", "false");
  });

  it("choosing Compact persists the same preference Command Center reads", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("radio", { name: /Compact/ }));

    expect(screen.getByRole("radio", { name: /Compact/ })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("pdlc:layout-density")).toBe(JSON.stringify("compact"));
  });

  it("Layout choice is remembered across a fresh mount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    unmount();

    render(<SettingsView isOwner={false} />);
    expect(await screen.findByRole("radio", { name: /Compact/ })).toHaveAttribute("aria-checked", "true");
  });
});
