import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as personalization from "./use-user-personalization";

const { DEFAULT_LANDING_KEY, useUserPersonalization } = personalization;

afterEach(() => localStorage.clear());

describe("useUserPersonalization", () => {
  /**
   * New readers land on the project page, which opens with the next thing
   * to do. The default used to be Command Center — a page of counts that
   * assumes you already know what they mean.
   */
  it("sends a new reader to the project page by default", () => {
    const { result } = renderHook(() => useUserPersonalization());
    expect(result.current.landingModule).toBe("");
  });

  it("remembers a chosen landing page", () => {
    const { result } = renderHook(() => useUserPersonalization());

    act(() => result.current.setLandingModule("/requirements"));

    expect(result.current.landingModule).toBe("/requirements");
    expect(localStorage.getItem(DEFAULT_LANDING_KEY)).toBe("/requirements");
  });

  /** The storage format did not change, so nobody's existing choice is lost. */
  it("keeps a choice saved before this change", () => {
    localStorage.setItem(DEFAULT_LANDING_KEY, "/command-center");

    const { result } = renderHook(() => useUserPersonalization());

    expect(result.current.landingModule).toBe("/command-center");
  });

  it("ignores a stored value that is not one of the offered pages", () => {
    localStorage.setItem(DEFAULT_LANDING_KEY, "/integrations");

    const { result } = renderHook(() => useUserPersonalization());

    expect(result.current.landingModule).toBe("");
  });

  it("updates every reader of the setting, not just the one that changed it", () => {
    const first = renderHook(() => useUserPersonalization());
    const second = renderHook(() => useUserPersonalization());

    act(() => first.result.current.setLandingModule("/decisions"));

    expect(second.result.current.landingModule).toBe("/decisions");
  });

  /**
   * `focusMode` was stored and exposed, and read by nothing. `showExpressBar`
   * controlled a menu that no longer exists. Neither should come back as a
   * switch that changes nothing.
   */
  it("offers no setting that nothing reads", () => {
    const { result } = renderHook(() => useUserPersonalization());

    expect(Object.keys(result.current).sort()).toEqual(["landingModule", "setLandingModule"]);
    expect(personalization).not.toHaveProperty("FOCUS_MODE_KEY");
    expect(personalization).not.toHaveProperty("EXPRESS_BAR_VISIBLE_KEY");
  });
});
