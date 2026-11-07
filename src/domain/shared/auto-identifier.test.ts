import { describe, expect, it } from "vitest";
import { artifactIdentifierSchema } from "./identifier";
import { RECORD_IDENTIFIER_PREFIXES, identifierPrefix, nextIdentifier } from "./auto-identifier";

describe("nextIdentifier", () => {
  it("starts at 001 when nothing is numbered yet", () => {
    expect(nextIdentifier("requirement", [])).toBe("REQ-001");
  });

  it("follows the highest number, not the count, so a gap is never refilled", () => {
    expect(nextIdentifier("requirement", ["REQ-001", "REQ-004"])).toBe("REQ-005");
  });

  it("reads unpadded and padded numbers alike", () => {
    expect(nextIdentifier("risk", ["RSK-12", "RSK-009"])).toBe("RSK-013");
  });

  it("ignores identifiers of any other shape, which cannot collide with a generated one", () => {
    expect(
      nextIdentifier("requirement", ["REQ-PROP-1", "SCN-42-REQ-001", "REQ-001A", "XREQ-900"]),
    ).toBe("REQ-001");
  });

  it("grows past three digits instead of wrapping", () => {
    expect(nextIdentifier("issue", ["ISS-999"])).toBe("ISS-1000");
  });

  it("uses each record type's own prefix", () => {
    expect(nextIdentifier("verificationActivity", ["REQ-007"])).toBe("VER-001");
    expect(identifierPrefix("decision")).toBe("ED-");
  });

  it("only ever produces identifiers the create schemas accept", () => {
    for (const kind of Object.keys(RECORD_IDENTIFIER_PREFIXES) as (keyof typeof RECORD_IDENTIFIER_PREFIXES)[]) {
      const generated = nextIdentifier(kind, [`${RECORD_IDENTIFIER_PREFIXES[kind]}-99999`]);
      expect(artifactIdentifierSchema.safeParse(generated).success, generated).toBe(true);
    }
  });
});
