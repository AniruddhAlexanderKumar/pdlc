import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCommandCenterLayout } from "./use-command-center-layout";

afterEach(() => {
  window.localStorage.clear();
});

describe("useCommandCenterLayout", () => {
  it("defaults to the Readiness tab", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));
    expect(result.current.activeTab).toBe("readiness");
  });

  it("switches tabs", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setActiveTab("suppliers");
    });

    expect(result.current.activeTab).toBe("suppliers");
  });

  it("is scoped per project — the open tab in one project does not affect another", () => {
    const a = renderHook(() => useCommandCenterLayout("proj1"));
    const b = renderHook(() => useCommandCenterLayout("proj2"));

    act(() => {
      a.result.current.setActiveTab("suppliers");
    });

    expect(a.result.current.activeTab).toBe("suppliers");
    expect(b.result.current.activeTab).toBe("readiness");
  });

  it("persists across a fresh mount", () => {
    const { result, unmount } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setActiveTab("sentinel");
    });
    unmount();

    const { result: fresh } = renderHook(() => useCommandCenterLayout("proj1"));
    expect(fresh.current.activeTab).toBe("sentinel");
  });

  /**
   * The storage key changed shape (an array of hidden sections → a single
   * tab key) when this became a tab selector. A value left over from the
   * old feature, or anything hand-edited into localStorage, must not
   * select a tab that doesn't exist — it falls back to the default.
   */
  it("falls back to Readiness for a value that names no real tab", () => {
    window.localStorage.setItem(
      "pdlc:command-center-tab:proj1",
      JSON.stringify("not-a-real-section"),
    );

    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    expect(result.current.activeTab).toBe("readiness");
  });

  it("falls back to Readiness for old array-shaped data left over from the hide-toggle feature", () => {
    window.localStorage.setItem("pdlc:command-center-tab:proj1", JSON.stringify(["suppliers"]));

    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    expect(result.current.activeTab).toBe("readiness");
  });
});
