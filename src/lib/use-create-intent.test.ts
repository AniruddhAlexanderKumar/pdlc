import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createIntentHref, useCreateDialogState } from "./use-create-intent";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("createIntentHref", () => {
  it("adds the parameter, keeping any query already there", () => {
    expect(createIntentHref("/projects/p1/risks")).toBe("/projects/p1/risks?new=1");
    expect(createIntentHref("/projects/p1/risks?status=OPEN")).toBe(
      "/projects/p1/risks?status=OPEN&new=1",
    );
  });
});

describe("useCreateDialogState", () => {
  it("is closed on an ordinary visit, and opens and closes by hand", () => {
    window.history.replaceState(null, "", "/projects/p1/risks");
    const { result } = renderHook(() => useCreateDialogState());

    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("opens on arrival when the URL asks, and forgets the request once closed", () => {
    window.history.replaceState(null, "", "/projects/p1/risks?status=OPEN&new=1");
    const { result } = renderHook(() => useCreateDialogState());

    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));

    expect(result.current[0]).toBe(false);
    // Only its own parameter goes; the rest of the URL is the reader's.
    expect(window.location.search).toBe("?status=OPEN");
  });
});
