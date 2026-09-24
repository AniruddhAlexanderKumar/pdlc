import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useUserPersonalization,
  DEFAULT_LANDING_KEY,
  EXPRESS_BAR_VISIBLE_KEY,
} from "./use-user-personalization";

describe("useUserPersonalization", () => {
  it("defaults to /command-center landing module and true express bar", () => {
    localStorage.clear();
    const { result } = renderHook(() => useUserPersonalization());
    expect(result.current.landingModule).toBe("/command-center");
    expect(result.current.showExpressBar).toBe(true);
  });

  it("updates landing module and persists to localStorage", () => {
    localStorage.clear();
    const { result } = renderHook(() => useUserPersonalization());

    act(() => {
      result.current.setLandingModule("/requirements");
    });

    expect(result.current.landingModule).toBe("/requirements");
    expect(localStorage.getItem(DEFAULT_LANDING_KEY)).toBe("/requirements");
  });

  it("toggles express bar visibility and persists", () => {
    localStorage.clear();
    const { result } = renderHook(() => useUserPersonalization());

    act(() => {
      result.current.setShowExpressBar(false);
    });

    expect(result.current.showExpressBar).toBe(false);
    expect(localStorage.getItem(EXPRESS_BAR_VISIBLE_KEY)).toBe("false");
  });
});
