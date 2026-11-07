import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredFlag } from "./use-stored-flag";

afterEach(() => {
  window.localStorage.clear();
});

describe("useStoredFlag", () => {
  it("defaults to false when nothing is stored", () => {
    const { result } = renderHook(() => useStoredFlag("test:flag"));
    expect(result.current[0]).toBe(false);
  });

  it("reads a value already in storage on first render", () => {
    window.localStorage.setItem("test:flag", "1");
    const { result } = renderHook(() => useStoredFlag("test:flag"));
    expect(result.current[0]).toBe(true);
  });

  it("setting the value updates this hook's own return value", () => {
    const { result } = renderHook(() => useStoredFlag("test:flag"));

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem("test:flag")).toBe("1");
  });

  it("a write from one instance is seen by a second instance reading the same key — not just a native storage event, which never fires same-tab", () => {
    const a = renderHook(() => useStoredFlag("test:flag"));
    const b = renderHook(() => useStoredFlag("test:flag"));

    act(() => {
      a.result.current[1](true);
    });

    expect(b.result.current[0]).toBe(true);
  });

  it("two different keys never interfere with each other", () => {
    const a = renderHook(() => useStoredFlag("test:flag-a"));
    const b = renderHook(() => useStoredFlag("test:flag-b"));

    act(() => {
      a.result.current[1](true);
    });

    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(false);
  });
});
