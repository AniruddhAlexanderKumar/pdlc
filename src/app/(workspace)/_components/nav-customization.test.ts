import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ALWAYS_VISIBLE_HREF, NAV_CUSTOMIZATION_STORAGE_KEY, useNavCustomization } from "./nav-customization";

afterEach(() => {
  window.localStorage.clear();
});

describe("useNavCustomization", () => {
  it("defaults to nothing hidden", () => {
    const { result } = renderHook(() => useNavCustomization());
    expect(result.current.hidden.size).toBe(0);
  });

  it("hides a module", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/risks", true);
    });

    expect(result.current.hidden.has("/risks")).toBe(true);
  });

  it("un-hides a module", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/risks", true);
    });
    act(() => {
      result.current.setHidden("/risks", false);
    });

    expect(result.current.hidden.has("/risks")).toBe(false);
  });

  it("never hides the always-visible module", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden(ALWAYS_VISIBLE_HREF, true);
    });

    expect(result.current.hidden.has(ALWAYS_VISIBLE_HREF)).toBe(false);
  });

  it("reset shows everything again", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/risks", true);
      result.current.setHidden("/suppliers", true);
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.hidden.size).toBe(0);
  });

  it("a write from one instance is seen by a second instance reading the same key", () => {
    const a = renderHook(() => useNavCustomization());
    const b = renderHook(() => useNavCustomization());

    act(() => {
      a.result.current.setHidden("/risks", true);
    });

    expect(b.result.current.hidden.has("/risks")).toBe(true);
  });

  it("persists across a fresh mount", () => {
    const { result, unmount } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/suppliers", true);
    });
    unmount();

    const { result: fresh } = renderHook(() => useNavCustomization());
    expect(fresh.current.hidden.has("/suppliers")).toBe(true);
  });

  /**
   * An earlier version also stored a `pinned` list. A browser that saved
   * one must keep its hidden pages hidden, not fail to read the whole
   * preference because of a field that no longer means anything.
   */
  it("still reads what the pinning version of this preference stored", () => {
    window.localStorage.setItem(
      NAV_CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({ hidden: ["/risks"], pinned: ["/suppliers"] }),
    );

    const { result } = renderHook(() => useNavCustomization());

    expect(result.current.hidden.has("/risks")).toBe(true);
    expect(result.current.hidden.has("/suppliers")).toBe(false);
  });
});
