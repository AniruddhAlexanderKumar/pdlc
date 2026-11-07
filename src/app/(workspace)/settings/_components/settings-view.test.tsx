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

  it("unticking a page hides it, with no Show all button until something is hidden", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    const risks = screen.getByRole("checkbox", { name: /^Risks/ });
    expect(risks).toBeChecked();

    await user.click(risks);

    expect(risks).not.toBeChecked();
    expect(JSON.parse(window.localStorage.getItem("pdlc:nav-customization") ?? "{}")).toEqual({
      hidden: ["/risks"],
    });
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();
  });

  it("Show all brings back every hidden page", async () => {
    const user = userEvent.setup();
    render(<SettingsView isOwner={false} />);

    await user.click(screen.getByRole("checkbox", { name: /^Risks/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Suppliers/ }));
    await user.click(screen.getByRole("button", { name: "Show all" }));

    expect(screen.getByRole("checkbox", { name: /^Risks/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^Suppliers/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });

  it("groups pages the way the sidebar does — by numbered step, then tools and team", () => {
    render(<SettingsView isOwner={false} />);

    expect(screen.getByRole("group", { name: "Step 1: Define" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Step 5: Control change" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Project tools" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Members/ })).toBeInTheDocument();
  });

  it("never offers Command Center, and has none of the old Simplify or pin controls", () => {
    render(<SettingsView isOwner={false} />);

    expect(screen.queryByRole("checkbox", { name: /Command Center/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /simplify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pin|^unpin/i })).not.toBeInTheDocument();
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
