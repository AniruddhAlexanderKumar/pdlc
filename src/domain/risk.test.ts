import { describe, expect, it } from "vitest";
import {
  RISK_RELATIONS,
  RISK_TRANSITIONS,
  allowedRiskTransitions,
  areRiskLinksEditable,
  assignRiskOwnerRequestSchema,
  canTransitionRisk,
  createRiskRequestSchema,
  isRiskContentEditable,
  isRiskOwnerAssignable,
  parseRiskLinkKey,
  riskLinkKey,
  riskLinkRequestSchema,
  riskRelationLabel,
  riskStatusLabel,
  transitionRiskRequestSchema,
  updateRiskRequestSchema,
} from "./risk";
import { RISK_STATUSES } from "./shared/enums";

describe("risk lifecycle", () => {
  it("has exactly four states", () => {
    expect(RISK_STATUSES).toEqual(["OPEN", "MITIGATED", "ACCEPTED", "CLOSED"]);
  });

  it("allows the documented transitions from OPEN", () => {
    expect(canTransitionRisk("OPEN", "MITIGATED")).toBe(true);
    expect(canTransitionRisk("OPEN", "ACCEPTED")).toBe(true);
    expect(canTransitionRisk("OPEN", "CLOSED")).toBe(true);
  });

  it("allows MITIGATED and ACCEPTED to close", () => {
    expect(canTransitionRisk("MITIGATED", "CLOSED")).toBe(true);
    expect(canTransitionRisk("ACCEPTED", "CLOSED")).toBe(true);
  });

  it("never allows MITIGATED or ACCEPTED to cross into each other", () => {
    expect(canTransitionRisk("MITIGATED", "ACCEPTED")).toBe(false);
    expect(canTransitionRisk("ACCEPTED", "MITIGATED")).toBe(false);
  });

  it("**makes CLOSED terminal — no reopen mechanism exists**", () => {
    for (const to of RISK_STATUSES) {
      expect(canTransitionRisk("CLOSED", to)).toBe(false);
    }
    expect(RISK_TRANSITIONS.CLOSED).toEqual([]);
  });

  it("never allows a self-transition", () => {
    for (const status of RISK_STATUSES) {
      expect(canTransitionRisk(status, status)).toBe(false);
    }
  });

  it("reports the exact legal set for each status", () => {
    expect(allowedRiskTransitions("OPEN")).toEqual(["MITIGATED", "ACCEPTED", "CLOSED"]);
    expect(allowedRiskTransitions("MITIGATED")).toEqual(["CLOSED"]);
    expect(allowedRiskTransitions("ACCEPTED")).toEqual(["CLOSED"]);
    expect(allowedRiskTransitions("CLOSED")).toEqual([]);
  });
});

describe("risk editability", () => {
  it("keeps content and owner editable everywhere except CLOSED", () => {
    for (const status of ["OPEN", "MITIGATED", "ACCEPTED"] as const) {
      expect(isRiskContentEditable(status)).toBe(true);
      expect(isRiskOwnerAssignable(status)).toBe(true);
      expect(areRiskLinksEditable(status)).toBe(true);
    }
  });

  it("**freezes content, owner and links once CLOSED**", () => {
    expect(isRiskContentEditable("CLOSED")).toBe(false);
    expect(isRiskOwnerAssignable("CLOSED")).toBe(false);
    expect(areRiskLinksEditable("CLOSED")).toBe(false);
  });
});

describe("risk display helpers", () => {
  it("gives every status a non-empty label", () => {
    for (const status of RISK_STATUSES) {
      expect(riskStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  it("gives every relation a non-empty label", () => {
    for (const relation of RISK_RELATIONS) {
      expect(riskRelationLabel(relation).length).toBeGreaterThan(0);
    }
  });
});

describe("request schemas", () => {
  it("**rejects status, organization, actor and timestamps on create**", () => {
    const base = { identifier: "RSK-001", title: "Coolant loss", description: "Loss of coolant flow." };
    expect(createRiskRequestSchema.safeParse(base).success).toBe(true);
    for (const field of ["status", "organizationId", "actorId", "createdAt", "updatedAt", "projectId"]) {
      expect(createRiskRequestSchema.safeParse({ ...base, [field]: "x" }).success).toBe(false);
    }
  });

  it("accepts optional cause, consequence and owner on create", () => {
    const parsed = createRiskRequestSchema.safeParse({
      identifier: "RSK-001",
      title: "Coolant loss",
      description: "Loss of coolant flow.",
      cause: "Pump failure",
      consequence: "Overheating",
      ownerId: "user1aaaaaaaaaaaaaaaaaaa",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateRiskRequestSchema.safeParse({}).success).toBe(false);
  });

  it("**never accepts status or owner through the content-update schema**", () => {
    expect(updateRiskRequestSchema.safeParse({ title: "New title", status: "CLOSED" }).success).toBe(false);
    expect(updateRiskRequestSchema.safeParse({ title: "New title", ownerId: "user1" }).success).toBe(false);
  });

  it("requires a real status on the transition schema", () => {
    expect(transitionRiskRequestSchema.safeParse({ to: "MITIGATED" }).success).toBe(true);
    expect(transitionRiskRequestSchema.safeParse({ to: "NOT_A_STATUS" }).success).toBe(false);
  });

  it("allows clearing an owner with an explicit null, but not omitting the field", () => {
    expect(assignRiskOwnerRequestSchema.safeParse({ ownerId: null }).success).toBe(true);
    expect(assignRiskOwnerRequestSchema.safeParse({ ownerId: "user1aaaaaaaaaaaaaaaaaaa" }).success).toBe(true);
    expect(assignRiskOwnerRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("the link contract", () => {
  it("covers exactly the three relations the join tables support", () => {
    expect(RISK_RELATIONS).toEqual(["REQUIREMENT", "DESIGN_ITEM", "ENGINEERING_DECISION"]);
  });

  it("validates every relation, and rejects an unknown one", () => {
    for (const relation of RISK_RELATIONS) {
      expect(riskLinkRequestSchema.safeParse({ relation, targetId: "x1aaaaaaaaaaaaaaaaaaaaa" }).success).toBe(true);
    }
    expect(
      riskLinkRequestSchema.safeParse({ relation: "SUPPLIER", targetId: "x1aaaaaaaaaaaaaaaaaaaaa" }).success,
    ).toBe(false);
  });

  it("rejects a link type field — none of the three tables carry one", () => {
    expect(
      riskLinkRequestSchema.safeParse({
        relation: "DESIGN_ITEM",
        targetId: "x1aaaaaaaaaaaaaaaaaaaaa",
        linkType: "ALLOCATED_TO",
      }).success,
    ).toBe(false);
  });

  it("round-trips the composite link key", () => {
    const key = riskLinkKey("DESIGN_ITEM", "row1aaaaaaaaaaaaaaaaaa");
    expect(key).toBe("DESIGN_ITEM:row1aaaaaaaaaaaaaaaaaa");
    expect(parseRiskLinkKey(key)).toEqual({ relation: "DESIGN_ITEM", rowId: "row1aaaaaaaaaaaaaaaaaa" });
  });

  it("refuses to parse a key naming an unknown relation", () => {
    expect(parseRiskLinkKey("SUPPLIER:row1")).toBeNull();
  });

  it("refuses to parse a malformed key", () => {
    expect(parseRiskLinkKey("not-a-key")).toBeNull();
    expect(parseRiskLinkKey("")).toBeNull();
    expect(parseRiskLinkKey(":row1")).toBeNull();
    expect(parseRiskLinkKey("DESIGN_ITEM:")).toBeNull();
  });
});

describe("what this domain never introduces", () => {
  it("**rejects a probability, impact or score field on creation — none is modelled**", () => {
    const base = { identifier: "RSK-001", title: "Coolant loss", description: "Loss of coolant flow." };
    for (const field of ["probability", "impact", "score", "riskScore", "severity"]) {
      expect(createRiskRequestSchema.safeParse({ ...base, [field]: 5 }).success).toBe(false);
    }
  });
});
