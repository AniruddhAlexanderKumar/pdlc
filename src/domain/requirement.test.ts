import { describe, expect, it } from "vitest";
import {
  REQUIREMENT_STATUSES,
  artifactIdentifierSchema,
  isValidArtifactIdentifier,
  projectScopedIdentifierSchema,
  requirementStatusSchema,
} from "@/domain";
import { createRequirementInputSchema } from "@/domain/requirement";

const VALID_INPUT = {
  projectId: "clh1project0000000000000",
  identifier: "REQ-001",
  title: "Landing gear retraction time",
  statement: "The landing gear shall fully retract within 8 seconds of command.",
};

describe("requirement identifiers", () => {
  it.each(["REQ-001", "SYS_REQ-42", "R1", "IFC-0001-A"])("accepts %s", (identifier) => {
    expect(isValidArtifactIdentifier(identifier)).toBe(true);
  });

  it.each([
    ["req-001", "lowercase"],
    ["REQ 001", "whitespace"],
    ["R", "too short"],
    ["", "empty"],
    ["REQ#001", "punctuation"],
    ["R".repeat(33), "too long"],
  ])("rejects %s (%s)", (identifier) => {
    expect(isValidArtifactIdentifier(identifier)).toBe(false);
  });

  it("reports why an identifier was rejected", () => {
    const result = artifactIdentifierSchema.safeParse("req 001");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/uppercase/i);
  });
});

describe("requirement identity is project-scoped", () => {
  it("requires a project id alongside the identifier", () => {
    const result = projectScopedIdentifierSchema.safeParse({ identifier: "REQ-001" });
    expect(result.success).toBe(false);
  });

  it("treats the same identifier in two projects as two distinct identities", () => {
    const first = projectScopedIdentifierSchema.parse({
      projectId: "clh1projectaaaaaaaaaaaaa",
      identifier: "REQ-001",
    });
    const second = projectScopedIdentifierSchema.parse({
      projectId: "clh1projectbbbbbbbbbbbbb",
      identifier: "REQ-001",
    });

    expect(first.identifier).toBe(second.identifier);
    expect(first.projectId).not.toBe(second.projectId);
  });

  it("rejects a requirement that is not scoped to a project", () => {
    const { projectId: _omitted, ...unscoped } = VALID_INPUT;
    const result = createRequirementInputSchema.safeParse(unscoped);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("projectId"))).toBe(true);
  });

  it("accepts a fully specified requirement", () => {
    const result = createRequirementInputSchema.parse(VALID_INPUT);
    expect(result.identifier).toBe("REQ-001");
    expect(result.projectId).toBe(VALID_INPUT.projectId);
  });
});

describe("requirement status", () => {
  it.each(REQUIREMENT_STATUSES)("accepts the %s lifecycle state", (status) => {
    expect(requirementStatusSchema.parse(status)).toBe(status);
  });

  it.each(["ARCHIVED", "draft", "IN REVIEW", ""])("rejects %s", (status) => {
    expect(requirementStatusSchema.safeParse(status).success).toBe(false);
  });

  it("rejects an unknown status on a create payload", () => {
    const result = createRequirementInputSchema.safeParse({ ...VALID_INPUT, status: "ARCHIVED" });
    expect(result.success).toBe(false);
  });

  it("leaves status unset when omitted so the database default applies", () => {
    expect(createRequirementInputSchema.parse(VALID_INPUT).status).toBeUndefined();
  });
});
