import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCommandCenterLayout } from "./use-command-center-layout";

afterEach(() => {
  window.localStorage.clear();
});

describe("useCommandCenterLayout", () => {
  it("defaults to nothing hidden — every section shows", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));
    expect(result.current.hidden.size).toBe(0);
  });

  it("hides a section", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setHidden("suppliers", true);
    });

    expect(result.current.hidden.has("suppliers")).toBe(true);
  });

  it("un-hides a section", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setHidden("suppliers", true);
    });
    act(() => {
      result.current.setHidden("suppliers", false);
    });

    expect(result.current.hidden.has("suppliers")).toBe(false);
  });

  it("reset clears every hidden section", () => {
    const { result } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setHidden("suppliers", true);
      result.current.setHidden("evidence", true);
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.hidden.size).toBe(0);
  });

  it("is scoped per project — hiding a section in one project does not touch another", () => {
    const a = renderHook(() => useCommandCenterLayout("proj1"));
    const b = renderHook(() => useCommandCenterLayout("proj2"));

    act(() => {
      a.result.current.setHidden("suppliers", true);
    });

    expect(a.result.current.hidden.has("suppliers")).toBe(true);
    expect(b.result.current.hidden.has("suppliers")).toBe(false);
  });

  it("persists across a fresh mount", () => {
    const { result, unmount } = renderHook(() => useCommandCenterLayout("proj1"));

    act(() => {
      result.current.setHidden("sentinel", true);
    });
    unmount();

    const { result: fresh } = renderHook(() => useCommandCenterLayout("proj1"));
    expect(fresh.current.hidden.has("sentinel")).toBe(true);
  });
});
