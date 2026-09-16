import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LAYOUT_DENSITY_STORAGE_KEY, useLayoutDensity } from "./use-layout-density";

afterEach(() => {
  window.localStorage.clear();
});

describe("useLayoutDensity", () => {
  it("defaults to comfortable", () => {
    const { result } = renderHook(() => useLayoutDensity());
    expect(result.current[0]).toBe("comfortable");
  });

  it("setting compact persists and is read back", () => {
    const { result } = renderHook(() => useLayoutDensity());

    act(() => {
      result.current[1]("compact");
    });

    expect(result.current[0]).toBe("compact");
  });

  it("falls back to comfortable for a value this version does not recognize", () => {
    window.localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, JSON.stringify("cozy"));
    const { result } = renderHook(() => useLayoutDensity());
    expect(result.current[0]).toBe("comfortable");
  });

  it("a write from one instance is seen by a second instance reading the same key", () => {
    const a = renderHook(() => useLayoutDensity());
    const b = renderHook(() => useLayoutDensity());

    act(() => {
      a.result.current[1]("compact");
    });

    expect(b.result.current[0]).toBe("compact");
  });

  it("persists across a fresh mount", () => {
    const { result, unmount } = renderHook(() => useLayoutDensity());

    act(() => {
      result.current[1]("compact");
    });
    unmount();

    const { result: fresh } = renderHook(() => useLayoutDensity());
    expect(fresh.current[0]).toBe("compact");
  });
});
