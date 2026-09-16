import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "./nav-customization";

afterEach(() => {
  window.localStorage.clear();
});

describe("useNavCustomization", () => {
  it("defaults to nothing hidden and nothing pinned", () => {
    const { result } = renderHook(() => useNavCustomization());
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pinned.size).toBe(0);
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

  it("pins a module", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setPinned("/suppliers", true);
    });

    expect(result.current.pinned.has("/suppliers")).toBe(true);
  });

  it("pinning a hidden module un-hides it — the two states are mutually exclusive", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/risks", true);
    });
    act(() => {
      result.current.setPinned("/risks", true);
    });

    expect(result.current.pinned.has("/risks")).toBe(true);
    expect(result.current.hidden.has("/risks")).toBe(false);
  });

  it("hiding a pinned module un-pins it", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setPinned("/risks", true);
    });
    act(() => {
      result.current.setHidden("/risks", true);
    });

    expect(result.current.hidden.has("/risks")).toBe(true);
    expect(result.current.pinned.has("/risks")).toBe(false);
  });

  it("never hides the always-visible module", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden(ALWAYS_VISIBLE_HREF, true);
    });

    expect(result.current.hidden.has(ALWAYS_VISIBLE_HREF)).toBe(false);
  });

  it("never pins the always-visible module — it is already always shown", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setPinned(ALWAYS_VISIBLE_HREF, true);
    });

    expect(result.current.pinned.has(ALWAYS_VISIBLE_HREF)).toBe(false);
  });

  it("reset clears both hidden and pinned", () => {
    const { result } = renderHook(() => useNavCustomization());

    act(() => {
      result.current.setHidden("/risks", true);
      result.current.setPinned("/suppliers", true);
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pinned.size).toBe(0);
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
      result.current.setPinned("/suppliers", true);
    });
    unmount();

    const { result: fresh } = renderHook(() => useNavCustomization());
    expect(fresh.current.pinned.has("/suppliers")).toBe(true);
  });
});
