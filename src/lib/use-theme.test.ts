import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./use-theme";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("useTheme", () => {
  it("defaults to system, with no data-theme attribute set", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("setting light sets data-theme=\"light\" on the document root", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current[1]("light");
    });

    expect(result.current[0]).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("setting dark sets data-theme=\"dark\"", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current[1]("dark");
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("returning to system removes the attribute again, letting prefers-color-scheme decide", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current[1]("dark");
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(true);

    act(() => {
      result.current[1]("system");
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("reads a preference already in storage on first render", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify("dark"));
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
  });

  it("falls back to system for a value this version does not recognize", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify("solarized"));
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("a write from one instance is seen by a second instance reading the same key", () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());

    act(() => {
      a.result.current[1]("dark");
    });

    expect(b.result.current[0]).toBe("dark");
  });
});
