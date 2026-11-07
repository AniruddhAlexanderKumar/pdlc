import { describe, expect, it } from "vitest";
import { MODULE_GUIDES, PLAIN_TERMS } from "./module-guide";

/**
 * Every page explains itself, and in words a newcomer can use.
 *
 * That every module in the navigation *has* a guide is checked beside the
 * navigation itself, in `project-modules.test.ts` — the domain layer does
 * not import from the app.
 */
describe("module guides", () => {
  it("answer all three questions for every module, each in one sentence", () => {
    for (const [module, guide] of Object.entries(MODULE_GUIDES)) {
      for (const [field, text] of Object.entries({ what: guide.what, why: guide.why, first: guide.first })) {
        expect(text.length, `${module}.${field} is too short to help`).toBeGreaterThan(25);
        expect(text.length, `${module}.${field} is a paragraph, not a sentence`).toBeLessThan(140);
        expect(text, `${module}.${field} should end as a sentence`).toMatch(/[.?]$/);
      }
    }
  });

  /**
   * The point of the guide is that a reader who does not know the jargon
   * can still follow it. The terms here are the ones the audit found
   * leaking into page descriptions.
   */
  it("explain each module without the jargon it is meant to explain", () => {
    const jargon = /\b(allocat\w*|originating|engineering basis|artifact|traversal|entity|node|edge|traceability edge)\b/i;

    for (const [module, guide] of Object.entries(MODULE_GUIDES)) {
      expect(`${guide.what} ${guide.why} ${guide.first}`, module).not.toMatch(jargon);
    }
  });

  it("keep the technical term available where the plain name differs from it", () => {
    expect(MODULE_GUIDES["/baselines"].technicalName).toBe("Engineering baseline");
    expect(MODULE_GUIDES["/verification"].technicalName).toBe("Verification activity");
  });

  /** A guide must not promise more than its module does. */
  it("say plainly that certification tracking is not an approval", () => {
    expect(MODULE_GUIDES["/certification"].why).toMatch(/not itself an approval/);
  });

  it("offer a plain word and the technical term for each specialised concept", () => {
    for (const term of Object.values(PLAIN_TERMS)) {
      expect(term.plain.length).toBeGreaterThan(5);
      expect(term.technical.length).toBeGreaterThan(5);
      expect(term.plain).not.toBe(term.technical);
    }
  });
});
