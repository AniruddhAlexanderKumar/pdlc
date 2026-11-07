import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MODULE_GUIDES } from "@/domain/module-guide";
import { ModuleGuidePanel, PAGE_GUIDES_HIDDEN_KEY } from "./module-guide-panel";

afterEach(() => localStorage.clear());

const REQUIREMENTS = MODULE_GUIDES["/requirements"];

describe("ModuleGuidePanel", () => {
  /** Open by default: the reader who needs it most hasn't yet learned where to switch it on. */
  it("answers what, why and where to start on a first visit", () => {
    render(<ModuleGuidePanel module="/requirements" />);

    expect(screen.getByText("What is this?")).toBeInTheDocument();
    expect(screen.getByText(REQUIREMENTS.what)).toBeInTheDocument();
    expect(screen.getByText(REQUIREMENTS.why)).toBeInTheDocument();
    expect(screen.getByText(REQUIREMENTS.first)).toBeInTheDocument();
  });

  it("names the technical term where the plain name differs from it", () => {
    render(<ModuleGuidePanel module="/baselines" />);
    expect(screen.getByText("Engineering baseline")).toBeInTheDocument();
  });

  it("stays hidden on that page after the reader hides it, across a reload", async () => {
    const user = userEvent.setup();
    const first = render(<ModuleGuidePanel module="/requirements" />);

    await user.click(screen.getByRole("button", { name: "Hide this guide" }));
    expect(screen.queryByText(REQUIREMENTS.what)).not.toBeInTheDocument();

    first.unmount();
    render(<ModuleGuidePanel module="/requirements" />);
    expect(screen.queryByText(REQUIREMENTS.what)).not.toBeInTheDocument();
  });

  it("hiding one page's guide leaves the others alone", async () => {
    const user = userEvent.setup();
    const first = render(<ModuleGuidePanel module="/requirements" />);
    await user.click(screen.getByRole("button", { name: "Hide this guide" }));
    first.unmount();

    render(<ModuleGuidePanel module="/risks" />);
    expect(screen.getByText(MODULE_GUIDES["/risks"].what)).toBeInTheDocument();
  });

  /** Help is never more than one click away, and never in the way. */
  it("leaves a single small link that brings it back", async () => {
    const user = userEvent.setup();
    render(<ModuleGuidePanel module="/requirements" />);

    await user.click(screen.getByRole("button", { name: "Hide this guide" }));
    await user.click(screen.getByRole("button", { name: "What is this page?" }));

    expect(screen.getByText(REQUIREMENTS.what)).toBeInTheDocument();
  });

  it("starts hidden everywhere once Settings says so, for readers who know their way around", () => {
    localStorage.setItem(PAGE_GUIDES_HIDDEN_KEY, "1");
    render(<ModuleGuidePanel module="/requirements" />);

    expect(screen.queryByText(REQUIREMENTS.what)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is this page?" })).toBeInTheDocument();
  });

  it("still opens on request when hidden everywhere, without undoing the Settings choice", async () => {
    localStorage.setItem(PAGE_GUIDES_HIDDEN_KEY, "1");
    const user = userEvent.setup();
    render(<ModuleGuidePanel module="/requirements" />);

    await user.click(screen.getByRole("button", { name: "What is this page?" }));

    expect(screen.getByText(REQUIREMENTS.what)).toBeInTheDocument();
    expect(localStorage.getItem(PAGE_GUIDES_HIDDEN_KEY)).toBe("1");
  });
});
