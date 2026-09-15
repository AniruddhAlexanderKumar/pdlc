import { describe, expect, it } from "vitest";
import { DOCS_SEARCH_INDEX, searchDocs } from "./docs-search";

describe("searchDocs", () => {
  it("returns nothing for an empty query", () => {
    expect(searchDocs("")).toEqual([]);
    expect(searchDocs("   ")).toEqual([]);
  });

  it("matches by title, case-insensitively", () => {
    const results = searchDocs("SECURITY");
    expect(results.some((r) => r.href === "/docs/security")).toBe(true);
  });

  it("matches by keyword even when the word is not in the title", () => {
    const results = searchDocs("argon2id");
    expect(results.some((r) => r.href === "/docs/security")).toBe(true);
  });

  it("never returns an entry whose href is not a real page in the index", () => {
    const results = searchDocs("deployment");
    for (const result of results) {
      expect(DOCS_SEARCH_INDEX.some((entry) => entry.href === result.href)).toBe(true);
    }
  });

  it("returns an empty array, not undefined, for a query matching nothing", () => {
    expect(searchDocs("xyznonexistent")).toEqual([]);
  });
});
