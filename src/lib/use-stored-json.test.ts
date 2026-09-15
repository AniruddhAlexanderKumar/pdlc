import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredJson } from "./use-stored-json";

afterEach(() => {
  window.localStorage.clear();
});

interface Prefs {
  columns: string[];
  density: "comfortable" | "compact";
}

const DEFAULT: Prefs = { columns: [], density: "comfortable" };

describe("useStoredJson", () => {
  it("defaults to the fallback when nothing is stored", () => {
    const { result } = renderHook(() => useStoredJson("test:json", DEFAULT));
    expect(result.current[0]).toEqual(DEFAULT);
  });

  it("reads a value already in storage on first render", () => {
    window.localStorage.setItem("test:json", JSON.stringify({ columns: ["a", "b"], density: "compact" }));
    const { result } = renderHook(() => useStoredJson("test:json", DEFAULT));
    expect(result.current[0]).toEqual({ columns: ["a", "b"], density: "compact" });
  });

  it("falls back to the default for corrupted JSON rather than throwing", () => {
    window.localStorage.setItem("test:json", "{not valid json");
    const { result } = renderHook(() => useStoredJson("test:json", DEFAULT));
    expect(result.current[0]).toEqual(DEFAULT);
  });

  it("setting a value updates this hook's own return value and localStorage", () => {
    const { result } = renderHook(() => useStoredJson("test:json", DEFAULT));

    act(() => {
      result.current[1]({ columns: ["x"], density: "compact" });
    });

    expect(result.current[0]).toEqual({ columns: ["x"], density: "compact" });
    expect(JSON.parse(window.localStorage.getItem("test:json")!)).toEqual({ columns: ["x"], density: "compact" });
  });

  it("accepts an updater function reading the current value", () => {
    const { result } = renderHook(() => useStoredJson("test:json", DEFAULT));

    act(() => {
      result.current[1]((prev) => ({ ...prev, density: "compact" }));
    });

    expect(result.current[0]).toEqual({ columns: [], density: "compact" });
  });

  it("a write from one instance is seen by a second instance reading the same key", () => {
    const a = renderHook(() => useStoredJson("test:json", DEFAULT));
    const b = renderHook(() => useStoredJson("test:json", DEFAULT));

    act(() => {
      a.result.current[1]({ columns: ["shared"], density: "comfortable" });
    });

    expect(b.result.current[0]).toEqual({ columns: ["shared"], density: "comfortable" });
  });

  it("returns a referentially stable value across re-renders when the stored content has not changed", () => {
    // The real bug this locks in: getSnapshot must not mint a fresh
    // JSON.parse() result on every call, or useSyncExternalStore re-renders
    // (in the worst case, without end) even though nothing actually changed.
    const { result, rerender } = renderHook(() => useStoredJson("test:json", DEFAULT));
    const first = result.current[0];
    rerender();
    const second = result.current[0];
    expect(second).toBe(first);
  });
});
