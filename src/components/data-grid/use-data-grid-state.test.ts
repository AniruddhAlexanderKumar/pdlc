import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LAYOUT_DENSITY_STORAGE_KEY } from "@/lib/use-layout-density";
import type { DataGridColumn } from "./data-grid-types";
import { useDataGridState } from "./use-data-grid-state";

interface Row {
  id: string;
}

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "id", header: "ID", cell: (row) => row.id, accessor: (row) => row.id },
];

afterEach(() => {
  window.localStorage.clear();
});

describe("useDataGridState", () => {
  it("defaults to comfortable density when no global preference is set", () => {
    const { result } = renderHook(() => useDataGridState("test-grid", COLUMNS));
    expect(result.current.density).toBe("comfortable");
  });

  it("a grid never touched before seeds its density from the global Layout preference", () => {
    window.localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, JSON.stringify("compact"));

    const { result } = renderHook(() => useDataGridState("test-grid", COLUMNS));

    expect(result.current.density).toBe("compact");
  });

  it("a grid with its own explicit density keeps it even if the global preference changes", () => {
    const { result } = renderHook(() => useDataGridState("test-grid", COLUMNS));

    act(() => {
      result.current.setDensity("compact");
    });

    // Now simulate the global preference changing to something else —
    // this grid already has its own stored value and must not move.
    window.localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, JSON.stringify("comfortable"));

    const { result: reread } = renderHook(() => useDataGridState("test-grid", COLUMNS));
    expect(reread.current.density).toBe("compact");
  });

  it("two different grids are seeded independently, from the same global preference", () => {
    window.localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, JSON.stringify("compact"));

    const a = renderHook(() => useDataGridState("grid-a", COLUMNS));
    const b = renderHook(() => useDataGridState("grid-b", COLUMNS));

    expect(a.result.current.density).toBe("compact");
    expect(b.result.current.density).toBe("compact");

    act(() => {
      a.result.current.setDensity("comfortable");
    });

    expect(a.result.current.density).toBe("comfortable");
    expect(b.result.current.density).toBe("compact");
  });
});
