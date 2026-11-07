// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No workspace screen may state a figure it did not read.
 *
 * This product's central promise is that a number on screen corresponds to
 * rows in the database — the Help page says so to the reader's face, and
 * `certification.test.ts`, `evidence.test.ts`, `impact-analysis.test.ts`
 * and `baseline-comparison.test.ts` each guard their own vocabulary against
 * scores. What none of them could catch was a *component* that simply
 * writes the number into the markup.
 *
 * A "Requirements Health Dashboard" did exactly that: `value: "92%"`,
 * `value: "78%"`, and RED/AMBER/GREEN ratings, all string literals, fetching
 * nothing, identical for every project in every organization. It read as
 * the most authoritative screen in the product and was the only one
 * containing no facts at all. In a tool whose job is aerospace
 * traceability, "92% complete" is a sentence someone might act on.
 *
 * So this scans the real workspace source for the shapes that defect took.
 * It is deliberately a filesystem scan rather than a rendering test:
 * rendering proves what one component does today, while this catches the
 * next one on the day it is written.
 */

const WORKSPACE = join(process.cwd(), "src/app/(workspace)");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

const FILES = sourceFiles(WORKSPACE).map((path) => ({
  path: path.replace(process.cwd(), "").replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

/** Strip comments, so prose *explaining* a removed violation is not itself flagged. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("no fabricated metrics in workspace screens", () => {
  it("scans a real, non-trivial set of files", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("states no hardcoded percentage", () => {
    const offenders = FILES.filter(({ source }) =>
      // A quoted percentage that is not a CSS dimension (100%, 50% etc. as
      // width/height are ordinary layout, not claims about engineering).
      /["'`]\s*\d{1,3}(\.\d+)?%\s*["'`]/.test(
        withoutComments(source).replace(/(width|height|maxWidth|minWidth|flexBasis)\s*[=:]\s*["'][^"']*["']/g, ""),
      ),
    ).map(({ path }) => path);

    expect(offenders, `hardcoded percentage in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("assigns no RED/AMBER/GREEN rating, which is a score wearing a colour", () => {
    const offenders = FILES.filter(({ source }) =>
      /["']AMBER["']/.test(withoutComments(source)),
    ).map(({ path }) => path);

    expect(offenders, `RAG rating in: ${offenders.join(", ")}`).toEqual([]);
  });
});

/**
 * The public site makes the same promise to people who have not signed in
 * yet — and broke it more often than the product did.
 *
 * It advertised eight integrations with named companies as "LIVE CONNECTED"
 * or "READY", none of which exist; a "live telemetry" strip reading "100%
 * OPERATIONAL", "LATENCY < 5MS" and "AES-256 GCM / ITAR COMPLIANT", all
 * hardcoded; and "SOC2 TYPE II & ITAR READY", while the site's own Known
 * Limitations page correctly says no such certification is held. A false
 * compliance claim to a prospective aerospace customer is not a copy
 * problem.
 */
const MARKETING = join(process.cwd(), "src/app/(marketing)");
const MARKETING_FILES = sourceFiles(MARKETING).map((path) => ({
  path: path.replace(process.cwd(), "").replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

/** JSX comments too, since explaining a removed claim must not re-trigger it. */
function withoutAnyComments(source: string): string {
  return withoutComments(source.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""));
}

describe("no unsupported claims on the public site", () => {
  it("scans the marketing pages", () => {
    expect(MARKETING_FILES.length).toBeGreaterThan(10);
  });

  /**
   * A percentage standing alone as a label — "100% OPERATIONAL", "92%" —
   * is a claim about the product. One inside a long sentence is usually
   * engineering content: an example requirement on this site says a valve
   * opens "from fully closed to 100% open in <= 45 ms", which is a
   * specification, not a boast. So only short strings are held to this.
   */
  it("states no percentage as a headline figure", () => {
    const offenders = MARKETING_FILES.flatMap(({ path, source }) =>
      [...withoutAnyComments(source)
        .replace(/className=("[^"]*"|\{`[^`]*`\})/g, "")
        // Geometry: where an SVG line or gradient stop sits, or a CSS box
        // dimension. A coordinate of "42%" places a line; it claims nothing.
        .replace(
          /\b(x|y|x1|x2|y1|y2|cx|cy|fx|fy|r|rx|ry|offset|width|height|top|left|right|bottom|maxWidth|minWidth)\s*[=:]\s*["'][^"']*["']/g,
          "",
        )
        .matchAll(/["'`]([^"'`\n]{0,40}\b\d{1,3}(\.\d+)?%[^"'`\n]{0,40})["'`]/g)]
        .map((match) => `${path}: ${match[1]}`),
    );

    expect(offenders).toEqual([]);
  });

  it("claims no compliance status the product does not hold", () => {
    const offenders = MARKETING_FILES.flatMap(({ path, source }) =>
      [...withoutAnyComments(source).matchAll(/\b(soc ?2|itar|fedramp|iso ?27001)\b[^.\n]{0,40}\b(ready|compliant|certified)\b/gi)]
        .map((match) => `${path}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });

  it("presents no integration as connected, because none exists", () => {
    const offenders = MARKETING_FILES.filter(({ source }) =>
      /LIVE CONNECTED|1-CLICK CONNECT/i.test(withoutAnyComments(source)),
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
