import { describe, expect, it } from "vitest";
import {
  ARTIFACT_DOMAINS,
  CHANGE_IMPACT_TARGET_TYPES,
  EVIDENCE_SUBJECT_TYPES,
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  IMPACT_PROPAGATION,
  SUPPLIED_ITEM_RELATIONS,
  SUPPLIED_ITEM_STATUSES,
  SUPPLIED_ITEM_TYPES,
  SUPPLIER_QUALIFICATION_STATUSES,
  SUPPLIER_QUALIFICATION_TYPES,
  SUPPLIER_STATUSES,
  artifactDomain,
  createSuppliedItemRequestSchema,
  createSupplierQualificationRequestSchema,
  createSupplierRequestSchema,
  crossesDomain,
  edgeTypesFrom,
  qualificationEvidenceLinkRequestSchema,
  suppliedItemLinkRequestSchema,
  suppliedItemRelationLabel,
  suppliedItemStatusSchema,
  suppliedItemTypeSchema,
  suppliedItemUnlinkRequestSchema,
  supplierQualificationStatusSchema,
  supplierQualificationTypeSchema,
  supplierStatusSchema,
  updateSuppliedItemRequestSchema,
  updateSupplierQualificationRequestSchema,
  updateSupplierRequestSchema,
} from "@/domain";

/**
 * The supplier engineering domain.
 *
 * These tests care about two things above correctness of the enums: that the
 * model stays *engineering* rather than procurement, and that supplier records
 * genuinely participate in the one product graph rather than sitting beside it.
 */

// --- Statuses and types -----------------------------------------------------

describe("supplier status", () => {
  it("records only engineering-relevant states", () => {
    expect(SUPPLIER_STATUSES).toEqual(["ACTIVE", "INACTIVE", "UNDER_REVIEW"]);
  });

  it("models no procurement state at all", () => {
    // No approval tier, preferred flag, contract state or vendor rating. Each
    // would be a commercial judgement this system has no basis to make.
    const forbidden = ["APPROVED", "PREFERRED", "BLACKLISTED", "CONTRACTED", "SUSPENDED"];
    for (const value of forbidden) {
      expect(SUPPLIER_STATUSES as readonly string[]).not.toContain(value);
    }
  });

  it("accepts every declared status and rejects anything else", () => {
    for (const status of SUPPLIER_STATUSES) {
      expect(supplierStatusSchema.parse(status)).toBe(status);
    }
    expect(supplierStatusSchema.safeParse("PREFERRED").success).toBe(false);
  });
});

describe("supplied item type and status", () => {
  it("covers the kinds of supply that matter to engineering", () => {
    expect(SUPPLIED_ITEM_TYPES).toEqual([
      "PART",
      "MATERIAL",
      "PROCESS",
      "SERVICE",
      "SOFTWARE",
      "OTHER",
    ]);
  });

  it("records whether the item is still part of the live definition", () => {
    expect(SUPPLIED_ITEM_STATUSES).toEqual(["ACTIVE", "OBSOLETE", "UNDER_REVIEW"]);
  });

  it("validates both", () => {
    for (const value of SUPPLIED_ITEM_TYPES) {
      expect(suppliedItemTypeSchema.parse(value)).toBe(value);
    }
    for (const value of SUPPLIED_ITEM_STATUSES) {
      expect(suppliedItemStatusSchema.parse(value)).toBe(value);
    }
    expect(suppliedItemTypeSchema.safeParse("FASTENER").success).toBe(false);
    expect(suppliedItemStatusSchema.safeParse("IN_STOCK").success).toBe(false);
  });
});

describe("qualification type and status", () => {
  it("is engineering-oriented and names no external standard", () => {
    expect(SUPPLIER_QUALIFICATION_TYPES).toEqual([
      "PROCESS",
      "MATERIAL",
      "PART",
      "SOURCE",
      "OTHER",
    ]);
  });

  it("records states a person sets, including withdrawal", () => {
    expect(SUPPLIER_QUALIFICATION_STATUSES).toEqual([
      "PLANNED",
      "ACTIVE",
      "EXPIRED",
      "WITHDRAWN",
    ]);
  });

  it("has no state that could only be produced by a clock", () => {
    // EXPIRED exists, but nothing in the domain derives it. There is
    // deliberately no LAPSED/OVERDUE/AUTO_EXPIRED that would only make sense as
    // a computed value.
    const derivedLooking = ["LAPSED", "OVERDUE", "AUTO_EXPIRED", "STALE"];
    for (const value of derivedLooking) {
      expect(SUPPLIER_QUALIFICATION_STATUSES as readonly string[]).not.toContain(value);
    }
  });

  it("validates both", () => {
    for (const value of SUPPLIER_QUALIFICATION_TYPES) {
      expect(supplierQualificationTypeSchema.parse(value)).toBe(value);
    }
    for (const value of SUPPLIER_QUALIFICATION_STATUSES) {
      expect(supplierQualificationStatusSchema.parse(value)).toBe(value);
    }
    expect(supplierQualificationStatusSchema.safeParse("CERTIFIED").success).toBe(false);
  });
});

// --- Request contracts ------------------------------------------------------

describe("the supplier request contracts", () => {
  it("accepts substance only", () => {
    const parsed = createSupplierRequestSchema.parse({
      identifier: "SUP-001",
      name: "Vulcan Alloys",
      description: "Forgings and billet.",
    });
    expect(parsed.identifier).toBe("SUP-001");
  });

  it("rejects a caller-supplied project or organization", () => {
    for (const extra of [{ projectId: "p1" }, { organizationId: "o1" }, { id: "s1" }]) {
      const result = createSupplierRequestSchema.safeParse({
        identifier: "SUP-001",
        name: "Vulcan Alloys",
        ...extra,
      });
      expect(result.success).toBe(false);
    }
  });

  it("requires a name", () => {
    expect(
      createSupplierRequestSchema.safeParse({ identifier: "SUP-001", name: "  " }).success,
    ).toBe(false);
  });

  it("does not let an update change the identifier", () => {
    expect(
      updateSupplierRequestSchema.safeParse({ identifier: "SUP-002" }).success,
    ).toBe(false);
  });

  it("refuses an empty update", () => {
    expect(updateSupplierRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("the supplied item request contracts", () => {
  it("names its supplier by id", () => {
    const parsed = createSuppliedItemRequestSchema.parse({
      supplierId: "sup1",
      identifier: "SI-001",
      name: "Inconel 718 forging",
      itemType: "MATERIAL",
    });
    expect(parsed.supplierId).toBe("sup1");
  });

  it("rejects a caller-supplied project", () => {
    expect(
      createSuppliedItemRequestSchema.safeParse({
        supplierId: "sup1",
        identifier: "SI-001",
        name: "Forging",
        itemType: "MATERIAL",
        projectId: "p1",
      }).success,
    ).toBe(false);
  });

  it("does not let an update re-parent the item", () => {
    // Re-parenting would silently rewrite what every engineering link on the
    // item means, so it is not an edit at all.
    expect(updateSuppliedItemRequestSchema.safeParse({ supplierId: "sup2" }).success).toBe(false);
  });
});

describe("the qualification request contracts", () => {
  it("allows a source qualification with no supplied item", () => {
    const parsed = createSupplierQualificationRequestSchema.parse({
      supplierId: "sup1",
      title: "Approved source",
      qualificationType: "SOURCE",
    });
    expect(parsed.suppliedItemId).toBeUndefined();
  });

  it("allows an item-scoped qualification", () => {
    const parsed = createSupplierQualificationRequestSchema.parse({
      supplierId: "sup1",
      suppliedItemId: "si1",
      title: "Vacuum braze process",
      qualificationType: "PROCESS",
    });
    expect(parsed.suppliedItemId).toBe("si1");
  });

  it("rejects a date that is not a date", () => {
    expect(
      createSupplierQualificationRequestSchema.safeParse({
        supplierId: "sup1",
        title: "Approved source",
        qualificationType: "SOURCE",
        effectiveDate: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("lets a person set the status on update", () => {
    // The whole point: moving a qualification to EXPIRED or WITHDRAWN is a
    // judgement someone records, and the contract has to carry it.
    const parsed = updateSupplierQualificationRequestSchema.parse({ status: "WITHDRAWN" });
    expect(parsed.status).toBe("WITHDRAWN");
  });

  it("does not let an update move either parent", () => {
    expect(
      updateSupplierQualificationRequestSchema.safeParse({ supplierId: "sup2" }).success,
    ).toBe(false);
    expect(
      updateSupplierQualificationRequestSchema.safeParse({ suppliedItemId: "si2" }).success,
    ).toBe(false);
  });
});

// --- Relationship contracts -------------------------------------------------

describe("supplied item relationships", () => {
  it("names exactly the six engineering relations the tables support", () => {
    expect([...SUPPLIED_ITEM_RELATIONS].sort()).toEqual([
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "EVIDENCE",
      "REQUIREMENT",
      "RISK",
      "VERIFICATION_ACTIVITY",
    ]);
  });

  it("labels every relation", () => {
    for (const relation of SUPPLIED_ITEM_RELATIONS) {
      expect(suppliedItemRelationLabel(relation).length).toBeGreaterThan(0);
    }
  });

  it("is a typed discriminator, not an entityType/entityId pair", () => {
    const result = suppliedItemLinkRequestSchema.safeParse({
      relation: "CHANGE_REQUEST",
      targetId: "cr1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid link and an optional note", () => {
    const parsed = suppliedItemLinkRequestSchema.parse({
      relation: "DESIGN_ITEM",
      targetId: "di1",
      note: "Chamber liner is machined from this billet.",
    });
    expect(parsed.relation).toBe("DESIGN_ITEM");
  });

  it("rejects extra fields on a link", () => {
    expect(
      suppliedItemLinkRequestSchema.safeParse({
        relation: "DESIGN_ITEM",
        targetId: "di1",
        projectId: "p1",
      }).success,
    ).toBe(false);
  });

  it("identifies an unlink by relation and target", () => {
    const parsed = suppliedItemUnlinkRequestSchema.parse({
      relation: "RISK",
      targetId: "risk1",
    });
    expect(parsed.targetId).toBe("risk1");
  });

  it("takes only an evidence id when attaching evidence to a qualification", () => {
    const parsed = qualificationEvidenceLinkRequestSchema.parse({ evidenceId: "ev1" });
    expect(parsed.evidenceId).toBe("ev1");
    expect(
      qualificationEvidenceLinkRequestSchema.safeParse({ evidenceId: "ev1", status: "ACTIVE" })
        .success,
    ).toBe(false);
  });
});

// --- Graph participation ----------------------------------------------------

describe("supplier participation in the product graph", () => {
  it("registers all three node types", () => {
    for (const type of ["SUPPLIER", "SUPPLIED_ITEM", "SUPPLIER_QUALIFICATION"]) {
      expect(GRAPH_NODE_TYPES as readonly string[]).toContain(type);
    }
  });

  it("registers every declared supplier edge", () => {
    const expected = [
      "SUPPLIER_PROVIDES_ITEM",
      "SUPPLIER_HAS_QUALIFICATION",
      "SUPPLIED_ITEM_QUALIFIED_BY",
      "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
      "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
      "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
      "SUPPLIED_ITEM_LINKED_TO_DECISION",
      "SUPPLIED_ITEM_LINKED_TO_RISK",
      "SUPPLIED_ITEM_HAS_EVIDENCE",
      "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
    ];
    for (const type of expected) {
      expect(GRAPH_EDGE_TYPES as readonly string[]).toContain(type);
    }
  });

  it("states an explicit direction for every supplier edge", () => {
    // Direction is declared in the registry, never inferred from a table name.
    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIER_PROVIDES_ITEM.source).toBe("SUPPLIER");
    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIER_PROVIDES_ITEM.targets).toEqual(["SUPPLIED_ITEM"]);

    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIED_ITEM_ALLOCATED_TO_DESIGN.source).toBe("SUPPLIED_ITEM");
    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIED_ITEM_ALLOCATED_TO_DESIGN.targets).toEqual([
      "DESIGN_ITEM",
    ]);

    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIED_ITEM_SUPPORTS_REQUIREMENT.source).toBe(
      "SUPPLIED_ITEM",
    );
    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIED_ITEM_SUPPORTS_REQUIREMENT.targets).toEqual([
      "REQUIREMENT",
    ]);

    expect(GRAPH_EDGE_DEFINITIONS.SUPPLIER_QUALIFICATION_HAS_EVIDENCE.source).toBe(
      "SUPPLIER_QUALIFICATION",
    );
  });

  it("puts each supplier node type on some outgoing list", () => {
    expect(edgeTypesFrom("SUPPLIER")).toContain("SUPPLIER_PROVIDES_ITEM");
    expect(edgeTypesFrom("SUPPLIED_ITEM")).toContain("SUPPLIED_ITEM_ALLOCATED_TO_DESIGN");
    expect(edgeTypesFrom("SUPPLIER_QUALIFICATION")).toContain(
      "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
    );
  });

  it("gives every supplier edge a meaning worth reading", () => {
    for (const type of GRAPH_EDGE_TYPES) {
      if (!type.startsWith("SUPPLI")) continue;
      expect(GRAPH_EDGE_DEFINITIONS[type].meaning.length).toBeGreaterThan(20);
    }
  });
});

describe("supplier participation in impact propagation", () => {
  it("has a propagation rule for every supplier edge", () => {
    for (const type of GRAPH_EDGE_TYPES) {
      if (!type.startsWith("SUPPLI")) continue;
      expect(IMPACT_PROPAGATION[type]).toBeDefined();
      expect(IMPACT_PROPAGATION[type].rationale.length).toBeGreaterThan(20);
    }
  });

  it("propagates a supplier change forward into engineering", () => {
    // This is the whole reason supplier records are in the graph: a change to
    // the supplier reaches its items, and an item reaches the product.
    expect(IMPACT_PROPAGATION.SUPPLIER_PROVIDES_ITEM.propagates).toBe(true);
    expect(IMPACT_PROPAGATION.SUPPLIED_ITEM_ALLOCATED_TO_DESIGN.propagates).toBe(true);
    expect(IMPACT_PROPAGATION.SUPPLIED_ITEM_SUPPORTS_REQUIREMENT.propagates).toBe(true);
    expect(IMPACT_PROPAGATION.SUPPLIED_ITEM_REQUIRES_VERIFICATION.propagates).toBe(true);
    expect(IMPACT_PROPAGATION.SUPPLIED_ITEM_LINKED_TO_DECISION.propagates).toBe(true);
  });

  it("places supplier records in their own domain", () => {
    expect(artifactDomain("SUPPLIER")).toBe("SUPPLY");
    expect(artifactDomain("SUPPLIED_ITEM")).toBe("SUPPLY");
    expect(artifactDomain("SUPPLIER_QUALIFICATION")).toBe("SUPPLY");
  });

  it("treats supply → design and supply → requirement as crossing a boundary", () => {
    // An engineer needs to see that a supply-side change left the supply side,
    // so these must classify as CROSS_DOMAIN rather than plain DOWNSTREAM.
    expect(crossesDomain("SUPPLIED_ITEM", "DESIGN_ITEM")).toBe(true);
    expect(crossesDomain("SUPPLIED_ITEM", "REQUIREMENT")).toBe(true);
    expect(crossesDomain("SUPPLIED_ITEM", "VERIFICATION_ACTIVITY")).toBe(true);
    // …but supplier → its own item does not.
    expect(crossesDomain("SUPPLIER", "SUPPLIED_ITEM")).toBe(false);
  });

  it("gives every node type a domain", () => {
    for (const type of GRAPH_NODE_TYPES) {
      expect(ARTIFACT_DOMAINS[type]).toBeDefined();
    }
  });
});

describe("supplier participation in the common change model", () => {
  it("makes supplier and supplied item declarable impact targets", () => {
    // Not a SupplierChangeRequest: the same change request, the same engine.
    expect(CHANGE_IMPACT_TARGET_TYPES as readonly string[]).toContain("SUPPLIER");
    expect(CHANGE_IMPACT_TARGET_TYPES as readonly string[]).toContain("SUPPLIED_ITEM");
  });

  it("reuses the existing evidence model", () => {
    expect(EVIDENCE_SUBJECT_TYPES as readonly string[]).toContain("SUPPLIED_ITEM");
    expect(EVIDENCE_SUBJECT_TYPES as readonly string[]).toContain("SUPPLIER_QUALIFICATION");
  });

  it("introduces no separate supplier change or supplier impact concept", () => {
    const suspicious = GRAPH_EDGE_TYPES.filter(
      (type) => type.includes("SUPPLIER_CHANGE") || type.includes("SUPPLIER_IMPACT"),
    );
    expect(suspicious).toEqual([]);
  });
});
