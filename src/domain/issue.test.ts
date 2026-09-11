import { describe, expect, it } from "vitest";
import {
  ISSUE_RELATIONS,
  ISSUE_TRANSITIONS,
  allowedIssueTransitions,
  areIssueLinksEditable,
  assignIssueOwnerRequestSchema,
  canTransitionIssue,
  createIssueRequestSchema,
  isIssueContentEditable,
  isIssueOwnerAssignable,
  issueLinkKey,
  issueLinkRequestSchema,
  issueRelationLabel,
  issueSeverityLabel,
  issueStatusLabel,
  parseIssueLinkKey,
  transitionIssueRequestSchema,
  updateIssueRequestSchema,
} from "./issue";
import { ISSUE_SEVERITIES, ISSUE_STATUSES } from "./shared/enums";

describe("issue lifecycle", () => {
  it("has exactly four states", () => {
    expect(ISSUE_STATUSES).toEqual(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
  });

  it("allows the ordinary path: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED", () => {
    expect(canTransitionIssue("OPEN", "IN_PROGRESS")).toBe(true);
    expect(canTransitionIssue("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransitionIssue("RESOLVED", "CLOSED")).toBe(true);
  });

  it("also allows OPEN straight to RESOLVED", () => {
    expect(canTransitionIssue("OPEN", "RESOLVED")).toBe(true);
  });

  it("never lets IN_PROGRESS skip straight to CLOSED", () => {
    expect(canTransitionIssue("IN_PROGRESS", "CLOSED")).toBe(false);
  });

  it("**makes CLOSED terminal — no reopen mechanism exists**", () => {
    for (const to of ISSUE_STATUSES) {
      expect(canTransitionIssue("CLOSED", to)).toBe(false);
    }
    expect(ISSUE_TRANSITIONS.CLOSED).toEqual([]);
  });

  it("never allows a self-transition", () => {
    for (const status of ISSUE_STATUSES) {
      expect(canTransitionIssue(status, status)).toBe(false);
    }
  });

  it("reports the exact legal set for each status", () => {
    expect(allowedIssueTransitions("OPEN")).toEqual(["IN_PROGRESS", "RESOLVED"]);
    expect(allowedIssueTransitions("IN_PROGRESS")).toEqual(["RESOLVED"]);
    expect(allowedIssueTransitions("RESOLVED")).toEqual(["CLOSED"]);
    expect(allowedIssueTransitions("CLOSED")).toEqual([]);
  });
});

describe("issue editability", () => {
  it("keeps content editable only while OPEN or IN_PROGRESS", () => {
    expect(isIssueContentEditable("OPEN")).toBe(true);
    expect(isIssueContentEditable("IN_PROGRESS")).toBe(true);
  });

  it("**freezes content once RESOLVED — there is no closure-note carve-out**", () => {
    expect(isIssueContentEditable("RESOLVED")).toBe(false);
    expect(isIssueContentEditable("CLOSED")).toBe(false);
  });

  it("keeps ownership assignable one stage further than content, frozen only at CLOSED", () => {
    expect(isIssueOwnerAssignable("OPEN")).toBe(true);
    expect(isIssueOwnerAssignable("IN_PROGRESS")).toBe(true);
    expect(isIssueOwnerAssignable("RESOLVED")).toBe(true);
    expect(isIssueOwnerAssignable("CLOSED")).toBe(false);
  });

  it("freezes links only once CLOSED", () => {
    expect(areIssueLinksEditable("OPEN")).toBe(true);
    expect(areIssueLinksEditable("RESOLVED")).toBe(true);
    expect(areIssueLinksEditable("CLOSED")).toBe(false);
  });
});

describe("issue display helpers", () => {
  it("gives every status a non-empty label", () => {
    for (const status of ISSUE_STATUSES) {
      expect(issueStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  it("gives every severity a non-empty label", () => {
    for (const severity of ISSUE_SEVERITIES) {
      expect(issueSeverityLabel(severity).length).toBeGreaterThan(0);
    }
  });

  it("gives every relation a non-empty label", () => {
    for (const relation of ISSUE_RELATIONS) {
      expect(issueRelationLabel(relation).length).toBeGreaterThan(0);
    }
  });
});

describe("request schemas", () => {
  it("requires severity on create — it is not optional", () => {
    const withoutSeverity = { identifier: "ISS-001", title: "Crack found", description: "A crack was found." };
    expect(createIssueRequestSchema.safeParse(withoutSeverity).success).toBe(false);
    expect(createIssueRequestSchema.safeParse({ ...withoutSeverity, severity: "HIGH" }).success).toBe(true);
  });

  it("**rejects status, organization, actor and timestamps on create**", () => {
    const base = {
      identifier: "ISS-001",
      title: "Crack found",
      description: "A crack was found.",
      severity: "HIGH",
    };
    for (const field of ["status", "organizationId", "actorId", "createdAt", "updatedAt", "projectId"]) {
      expect(createIssueRequestSchema.safeParse({ ...base, [field]: "x" }).success).toBe(false);
    }
  });

  it("rejects an empty update", () => {
    expect(updateIssueRequestSchema.safeParse({}).success).toBe(false);
  });

  it("**never accepts status or owner through the content-update schema**", () => {
    expect(updateIssueRequestSchema.safeParse({ title: "New title", status: "CLOSED" }).success).toBe(false);
    expect(updateIssueRequestSchema.safeParse({ title: "New title", ownerId: "user1" }).success).toBe(false);
  });

  it("allows updating severity through the content-update schema", () => {
    expect(updateIssueRequestSchema.safeParse({ severity: "CRITICAL" }).success).toBe(true);
  });

  it("requires a real status on the transition schema", () => {
    expect(transitionIssueRequestSchema.safeParse({ to: "RESOLVED" }).success).toBe(true);
    expect(transitionIssueRequestSchema.safeParse({ to: "NOT_A_STATUS" }).success).toBe(false);
  });

  it("allows clearing an owner with an explicit null, but not omitting the field", () => {
    expect(assignIssueOwnerRequestSchema.safeParse({ ownerId: null }).success).toBe(true);
    expect(assignIssueOwnerRequestSchema.safeParse({ ownerId: "user1aaaaaaaaaaaaaaaaaaa" }).success).toBe(true);
    expect(assignIssueOwnerRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("the link contract", () => {
  it("covers exactly the three relations the join tables support", () => {
    expect(ISSUE_RELATIONS).toEqual(["REQUIREMENT", "DESIGN_ITEM", "ENGINEERING_DECISION"]);
  });

  it("validates every relation, and rejects an unknown one", () => {
    for (const relation of ISSUE_RELATIONS) {
      expect(issueLinkRequestSchema.safeParse({ relation, targetId: "x1aaaaaaaaaaaaaaaaaaaaa" }).success).toBe(
        true,
      );
    }
    expect(
      issueLinkRequestSchema.safeParse({ relation: "SUPPLIER", targetId: "x1aaaaaaaaaaaaaaaaaaaaa" }).success,
    ).toBe(false);
  });

  it("rejects a link type field — none of the three tables carry one", () => {
    expect(
      issueLinkRequestSchema.safeParse({
        relation: "DESIGN_ITEM",
        targetId: "x1aaaaaaaaaaaaaaaaaaaaa",
        linkType: "ALLOCATED_TO",
      }).success,
    ).toBe(false);
  });

  it("round-trips the composite link key", () => {
    const key = issueLinkKey("REQUIREMENT", "row1aaaaaaaaaaaaaaaaaa");
    expect(key).toBe("REQUIREMENT:row1aaaaaaaaaaaaaaaaaa");
    expect(parseIssueLinkKey(key)).toEqual({ relation: "REQUIREMENT", rowId: "row1aaaaaaaaaaaaaaaaaa" });
  });

  it("refuses to parse a key naming an unknown relation", () => {
    expect(parseIssueLinkKey("SUPPLIER:row1")).toBeNull();
  });

  it("refuses to parse a malformed key", () => {
    expect(parseIssueLinkKey("not-a-key")).toBeNull();
    expect(parseIssueLinkKey("")).toBeNull();
    expect(parseIssueLinkKey(":row1")).toBeNull();
    expect(parseIssueLinkKey("REQUIREMENT:")).toBeNull();
  });
});

describe("what this domain never introduces", () => {
  it("**rejects a probability, impact or numeric score field on creation — severity is the only classification**", () => {
    const base = {
      identifier: "ISS-001",
      title: "Crack found",
      description: "A crack was found.",
      severity: "HIGH",
    };
    for (const field of ["probability", "impact", "score", "priority"]) {
      expect(createIssueRequestSchema.safeParse({ ...base, [field]: 5 }).success).toBe(false);
    }
  });
});
