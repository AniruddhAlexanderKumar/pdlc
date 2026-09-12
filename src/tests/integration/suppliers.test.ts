import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
  uniqueSuffix,
} from "./setup";

/**
 * Supplier engineering against real PostgreSQL.
 *
 * The unit suite fakes repositories, so it proves the services' logic but says
 * nothing about whether the schema underneath is right. This suite runs the real
 * tables: unique constraints, foreign keys, the widened CHECK constraints,
 * cascade and RESTRICT behaviour, project scoping, and the graph resolvers that
 * read the new join tables.
 *
 * Nothing is mocked. A malformed `where`, a missing index or a CHECK constraint
 * that was not widened fails here and nowhere else.
 */

const modules = databaseAvailable
  ? {
      supplier: await import("@/server/repositories/supplier.repository"),
      item: await import("@/server/repositories/supplied-item.repository"),
      qualification: await import("@/server/repositories/supplier-qualification.repository"),
      change: await import("@/server/repositories/change-request.repository"),
      artifacts: await import("@/server/repositories/project-artifacts.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
      graph: await import("@/server/repositories/graph-repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`supplier engineering against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant("supplier-primary");
    otherTenant = await createTestTenant("supplier-other");
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  /** A supplier in the given project, with a unique identifier per call. */
  async function makeSupplier(projectId = tenant.projectId, label = "sup") {
    return modules!.supplier.createSupplier({
      projectId,
      identifier: uniqueSuffix(label).toUpperCase().slice(0, 40),
      name: "Vulcan Alloys",
      description: null,
    });
  }

  async function makeItem(supplierId: string, projectId = tenant.projectId, label = "si") {
    return modules!.item.createSuppliedItem({
      projectId,
      supplierId,
      identifier: uniqueSuffix(label).toUpperCase().slice(0, 40),
      name: "Inconel 718 billet",
      description: null,
      itemType: "MATERIAL",
    });
  }

  async function makeDesignItem(projectId = tenant.projectId) {
    return integrationPrisma!.designItem.create({
      data: {
        projectId,
        identifier: uniqueSuffix("di").toUpperCase().slice(0, 40),
        name: "Combustion chamber",
        itemType: "COMPONENT",
      },
    });
  }

  async function makeRequirement(projectId = tenant.projectId) {
    return integrationPrisma!.requirement.create({
      data: {
        projectId,
        identifier: uniqueSuffix("req").toUpperCase().slice(0, 40),
        title: "Chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      },
    });
  }

  // --- Tables and constraints ---------------------------------------------

  describe("the supplier tables", () => {
    it("creates and reads back a supplier", async () => {
      const created = await makeSupplier();

      const found = await modules!.supplier.findSupplierInProject(
        tenant.projectId,
        created.id,
      );

      expect(found?.name).toBe("Vulcan Alloys");
      expect(found?.status).toBe("ACTIVE");
    });

    it("enforces identifier uniqueness within a project", async () => {
      const identifier = uniqueSuffix("dup").toUpperCase().slice(0, 40);
      await modules!.supplier.createSupplier({
        projectId: tenant.projectId,
        identifier,
        name: "First",
        description: null,
      });

      await expect(
        modules!.supplier.createSupplier({
          projectId: tenant.projectId,
          identifier,
          name: "Second",
          description: null,
        }),
      ).rejects.toThrow(/already exists/i);
    });

    it("allows the same identifier in a different project", async () => {
      const identifier = uniqueSuffix("shared").toUpperCase().slice(0, 40);
      await modules!.supplier.createSupplier({
        projectId: tenant.projectId,
        identifier,
        name: "Ours",
        description: null,
      });

      // Suppliers are project-scoped, so two programmes can use the same code.
      const other = await modules!.supplier.createSupplier({
        projectId: otherTenant.projectId,
        identifier,
        name: "Theirs",
        description: null,
      });

      expect(other.identifier).toBe(identifier);
    });

    it("counts supplied items and qualifications in one query", async () => {
      const supplier = await makeSupplier();
      await makeItem(supplier.id);
      await makeItem(supplier.id);
      await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Approved source",
        qualificationType: "SOURCE",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });

      const list = await modules!.supplier.listSuppliersInProject(tenant.projectId);
      const found = list.find((row) => row.id === supplier.id)!;

      // Real aggregates, not estimates: the list view shows these figures.
      expect(found.suppliedItemCount).toBe(2);
      expect(found.qualificationCount).toBe(1);
    });

    it("enforces the supplied item foreign key to its supplier", async () => {
      await expect(
        modules!.item.createSuppliedItem({
          projectId: tenant.projectId,
          supplierId: "does-not-exist",
          identifier: uniqueSuffix("orphan").toUpperCase().slice(0, 40),
          name: "Orphan",
          description: null,
          itemType: "PART",
        }),
      ).rejects.toThrow();
    });

    it("refuses to delete a supplier that still provides an item", async () => {
      // RESTRICT, not CASCADE: deleting a supplier must not silently remove the
      // items the product depends on, along with every engineering link to them.
      const supplier = await makeSupplier();
      await makeItem(supplier.id);

      await expect(
        integrationPrisma!.supplier.delete({ where: { id: supplier.id } }),
      ).rejects.toThrow();
    });

    it("stores a qualification with no supplied item", async () => {
      const supplier = await makeSupplier();

      const created = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Approved source",
        qualificationType: "SOURCE",
        evidenceReference: "QMS-1",
        effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
        expiryDate: new Date("2027-01-01T00:00:00.000Z"),
      });

      expect(created.suppliedItemId).toBeNull();
      expect(created.effectiveDate?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });

    it("cascades qualifications when the supplier is removed", async () => {
      const supplier = await makeSupplier();
      const qualification = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Approved source",
        qualificationType: "SOURCE",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });

      // No items, so the RESTRICT does not apply.
      await integrationPrisma!.supplier.delete({ where: { id: supplier.id } });

      const found = await integrationPrisma!.supplierQualification.findUnique({
        where: { id: qualification.id },
      });
      expect(found).toBeNull();
    });
  });

  // --- Relationships -------------------------------------------------------

  describe("supplied item relationships", () => {
    it("writes and reads every typed relationship", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const design = await makeDesignItem();
      const requirement = await makeRequirement();
      const activity = await integrationPrisma!.verificationActivity.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("va").toUpperCase().slice(0, 40),
          title: "Tensile coupon test",
          method: "TEST",
        },
      });
      const decision = await integrationPrisma!.engineeringDecision.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ed").toUpperCase().slice(0, 40),
          title: "Select billet supplier",
          statement: "Use Vulcan.",
          rationale: "Lead time.",
        },
      });
      const risk = await integrationPrisma!.risk.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("rk").toUpperCase().slice(0, 40),
          title: "Single source",
          description: "Only one qualified source.",
        },
      });
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "Mill certificate",
          evidenceType: "DOCUMENT",
          sourceReference: "MC-2026-001",
        },
      });

      const targets = [
        ["DESIGN_ITEM", design.id],
        ["REQUIREMENT", requirement.id],
        ["VERIFICATION_ACTIVITY", activity.id],
        ["ENGINEERING_DECISION", decision.id],
        ["RISK", risk.id],
        ["EVIDENCE", evidence.id],
      ] as const;

      for (const [relation, targetId] of targets) {
        await modules!.item.linkSuppliedItem({
          suppliedItemId: item.id,
          relation,
          targetId,
          note: `linked ${relation}`,
          createdById: tenant.userId,
        });
      }

      const links = await modules!.item.listSuppliedItemLinks(item.id, tenant.projectId);

      expect(links.map((link) => link.relation).sort()).toEqual([
        "DESIGN_ITEM",
        "ENGINEERING_DECISION",
        "EVIDENCE",
        "REQUIREMENT",
        "RISK",
        "VERIFICATION_ACTIVITY",
      ]);
      expect(links.find((l) => l.relation === "DESIGN_ITEM")?.title).toBe("Combustion chamber");
      // Evidence has no project-scoped identifier; its source reference is cited.
      expect(links.find((l) => l.relation === "EVIDENCE")?.identifier).toBe("MC-2026-001");
    });

    it("rejects a duplicate relationship", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const design = await makeDesignItem();

      await modules!.item.linkSuppliedItem({
        suppliedItemId: item.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        note: null,
        createdById: null,
      });

      await expect(
        modules!.item.linkSuppliedItem({
          suppliedItemId: item.id,
          relation: "DESIGN_ITEM",
          targetId: design.id,
          note: null,
          createdById: null,
        }),
      ).rejects.toThrow(/already recorded/i);
    });

    it("removes a relationship and reports whether a row went", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const design = await makeDesignItem();

      await modules!.item.linkSuppliedItem({
        suppliedItemId: item.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        note: null,
        createdById: null,
      });

      expect(
        await modules!.item.unlinkSuppliedItem(item.id, "DESIGN_ITEM", design.id),
      ).toBe(true);
      expect(
        await modules!.item.unlinkSuppliedItem(item.id, "DESIGN_ITEM", design.id),
      ).toBe(false);
    });

    it("does not see a link whose other end is in another project", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const foreignDesign = await makeDesignItem(otherTenant.projectId);

      // Written directly, bypassing the service, to prove the *read* is scoped.
      await integrationPrisma!.suppliedItemDesignLink.create({
        data: { suppliedItemId: item.id, designItemId: foreignDesign.id },
      });

      const links = await modules!.item.listSuppliedItemLinks(item.id, tenant.projectId);

      expect(links).toEqual([]);
    });

    it("reports a cross-project target as absent from this project", async () => {
      const foreignDesign = await makeDesignItem(otherTenant.projectId);

      expect(
        await modules!.item.suppliedItemLinkTargetExists(
          "DESIGN_ITEM",
          foreignDesign.id,
          tenant.projectId,
        ),
      ).toBe(false);
    });

    it("cascades link rows when the supplied item is removed", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const design = await makeDesignItem();

      await modules!.item.linkSuppliedItem({
        suppliedItemId: item.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        note: null,
        createdById: null,
      });

      await integrationPrisma!.suppliedItem.delete({ where: { id: item.id } });

      const remaining = await integrationPrisma!.suppliedItemDesignLink.count({
        where: { suppliedItemId: item.id },
      });
      expect(remaining).toBe(0);
    });
  });

  // --- Evidence and the widened CHECK constraint ---------------------------

  describe("the widened evidence CHECK constraint", () => {
    it("accepts a supplied item as an evidence subject", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "Mill certificate",
          evidenceType: "DOCUMENT",
          sourceReference: uniqueSuffix("mc"),
        },
      });

      const row = await integrationPrisma!.evidenceLink.create({
        data: { evidenceId: evidence.id, suppliedItemId: item.id },
      });

      expect(row.suppliedItemId).toBe(item.id);
    });

    it("accepts a qualification as an evidence subject", async () => {
      const supplier = await makeSupplier();
      const qualification = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Approved source",
        qualificationType: "SOURCE",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "Audit report",
          evidenceType: "DOCUMENT",
          sourceReference: uniqueSuffix("ar"),
        },
      });

      await modules!.qualification.linkQualificationEvidence(
        qualification.id,
        evidence.id,
        "2026 surveillance audit",
        tenant.userId,
      );

      const attached = await modules!.qualification.listQualificationEvidence(
        qualification.id,
        tenant.projectId,
      );

      expect(attached).toHaveLength(1);
      expect(attached[0]?.sourceReference).toBeTruthy();
      expect(attached[0]?.note).toBe("2026 surveillance audit");
    });

    it("still refuses a row with two subjects set", async () => {
      // The constraint was widened, not weakened: exactly one subject per row.
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const requirement = await makeRequirement();
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "Two subjects",
          evidenceType: "DOCUMENT",
          sourceReference: uniqueSuffix("ts"),
        },
      });

      await expect(
        integrationPrisma!.evidenceLink.create({
          data: {
            evidenceId: evidence.id,
            suppliedItemId: item.id,
            requirementId: requirement.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("still refuses a row with no subject at all", async () => {
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "No subject",
          evidenceType: "DOCUMENT",
          sourceReference: uniqueSuffix("ns"),
        },
      });

      await expect(
        integrationPrisma!.evidenceLink.create({ data: { evidenceId: evidence.id } }),
      ).rejects.toThrow();
    });
  });

  // --- Change impact targets ----------------------------------------------

  describe("supplier change-impact targets", () => {
    async function makeChange() {
      return integrationPrisma!.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("cr").toUpperCase().slice(0, 40),
          title: "Second-source the billet",
          description: "Qualify a second supplier.",
          reason: "Lead time risk.",
          requestedById: tenant.userId,
        },
      });
    }

    it("records a supplier as a declared impact target", async () => {
      const supplier = await makeSupplier();
      const change = await makeChange();

      const impactId = await modules!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "SUPPLIER",
        targetId: supplier.id,
        note: null,
        createdById: tenant.userId,
      });

      const impacts = await modules!.change.listDeclaredImpacts(change.id);
      expect(impacts).toHaveLength(1);
      expect(impacts[0]?.id).toBe(impactId);
      expect(impacts[0]?.target).toEqual({ type: "SUPPLIER", id: supplier.id });
      expect(impacts[0]?.targetTitle).toBe("Vulcan Alloys");
    });

    it("records a supplied item as a declared impact target", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const change = await makeChange();

      await modules!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "SUPPLIED_ITEM",
        targetId: item.id,
        note: "Material change",
        createdById: tenant.userId,
      });

      const impacts = await modules!.change.listDeclaredImpacts(change.id);
      expect(impacts[0]?.target).toEqual({ type: "SUPPLIED_ITEM", id: item.id });
      expect(impacts[0]?.targetIdentifier).toBe(item.identifier);
    });

    it("scopes target existence to the project", async () => {
      const foreign = await makeSupplier(otherTenant.projectId, "foreign");

      expect(
        await modules!.change.changeImpactTargetExistsInProject(
          "SUPPLIER",
          foreign.id,
          tenant.projectId,
        ),
      ).toBe(false);
      expect(
        await modules!.change.changeImpactTargetExistsInProject(
          "SUPPLIER",
          foreign.id,
          otherTenant.projectId,
        ),
      ).toBe(true);
    });

    it("still refuses a change impact naming two targets", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const change = await makeChange();

      await expect(
        integrationPrisma!.changeRequestImpact.create({
          data: {
            changeRequestId: change.id,
            supplierId: supplier.id,
            suppliedItemId: item.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("offers suppliers and supplied items in the impact target picker", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);

      const options = await modules!.artifacts.listChangeImpactTargets(tenant.projectId);

      expect(options.SUPPLIER.some((o) => o.id === supplier.id)).toBe(true);
      expect(options.SUPPLIED_ITEM.some((o) => o.id === item.id)).toBe(true);
    });

    it("offers only this project's artifacts as supplied-item link targets", async () => {
      const mine = await makeDesignItem();
      const theirs = await makeDesignItem(otherTenant.projectId);

      const targets = await modules!.artifacts.listSuppliedItemLinkTargets(tenant.projectId);

      expect(targets.DESIGN_ITEM.some((o) => o.id === mine.id)).toBe(true);
      expect(targets.DESIGN_ITEM.some((o) => o.id === theirs.id)).toBe(false);
    });
  });

  // --- Graph resolution ----------------------------------------------------

  describe("graph resolution over the real tables", () => {
    it("resolves supplier, supplied item and qualification nodes", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const qualification = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: item.id,
        title: "VIM qualification",
        qualificationType: "MATERIAL",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });

      const repository = new modules!.graph.EngineeringGraphRepository();
      const nodes = await repository.resolveNodes(tenant.projectId, [
        { type: "SUPPLIER", id: supplier.id },
        { type: "SUPPLIED_ITEM", id: item.id },
        { type: "SUPPLIER_QUALIFICATION", id: qualification.id },
      ]);

      expect(nodes.get(`SUPPLIER:${supplier.id}`)?.label).toBe("Vulcan Alloys");
      expect(nodes.get(`SUPPLIED_ITEM:${item.id}`)?.identifier).toBe(item.identifier);
      // A qualification carries no project-scoped identifier of its own.
      expect(nodes.get(`SUPPLIER_QUALIFICATION:${qualification.id}`)?.identifier).toBeNull();
      expect(nodes.get(`SUPPLIER_QUALIFICATION:${qualification.id}`)?.label).toBe(
        "VIM qualification",
      );
    });

    it("reads supplier → item and item → design as real edges", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const design = await makeDesignItem();

      await modules!.item.linkSuppliedItem({
        suppliedItemId: item.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        note: null,
        createdById: tenant.userId,
      });

      const repository = new modules!.graph.EngineeringGraphRepository();

      const fromSupplier = await repository.getOutgoingEdges(tenant.projectId, [
        { type: "SUPPLIER", id: supplier.id },
      ]);
      expect(
        fromSupplier.some(
          (edge) => edge.type === "SUPPLIER_PROVIDES_ITEM" && edge.target.id === item.id,
        ),
      ).toBe(true);

      const fromItem = await repository.getOutgoingEdges(tenant.projectId, [
        { type: "SUPPLIED_ITEM", id: item.id },
      ]);
      expect(
        fromItem.some(
          (edge) =>
            edge.type === "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN" && edge.target.id === design.id,
        ),
      ).toBe(true);

      // And inbound from the design item's side.
      const intoDesign = await repository.getIncomingEdges(tenant.projectId, [
        { type: "DESIGN_ITEM", id: design.id },
      ]);
      expect(
        intoDesign.some((edge) => edge.type === "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN"),
      ).toBe(true);
    });

    it("reads both qualification parent edges, and omits the item edge when there is none", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const scoped = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: item.id,
        title: "Item qualification",
        qualificationType: "MATERIAL",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });
      const sourceOnly = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Source qualification",
        qualificationType: "SOURCE",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });

      const repository = new modules!.graph.EngineeringGraphRepository();

      const fromSupplier = await repository.getOutgoingEdges(
        tenant.projectId,
        [{ type: "SUPPLIER", id: supplier.id }],
        ["SUPPLIER_HAS_QUALIFICATION"],
      );
      const qualified = fromSupplier.map((edge) => edge.target.id).sort();
      expect(qualified).toEqual([scoped.id, sourceOnly.id].sort());

      const fromItem = await repository.getOutgoingEdges(
        tenant.projectId,
        [{ type: "SUPPLIED_ITEM", id: item.id }],
        ["SUPPLIED_ITEM_QUALIFIED_BY"],
      );
      // Only the item-scoped one: a SOURCE qualification names no item.
      expect(fromItem.map((edge) => edge.target.id)).toEqual([scoped.id]);
    });

    it("reads supplier-side evidence edges from the shared table", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const qualification = await modules!.qualification.createSupplierQualification({
        projectId: tenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: null,
        title: "Approved source",
        qualificationType: "SOURCE",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: uniqueSuffix("ev"),
          title: "Certificate",
          evidenceType: "DOCUMENT",
          sourceReference: uniqueSuffix("ce"),
        },
      });

      await modules!.item.linkSuppliedItem({
        suppliedItemId: item.id,
        relation: "EVIDENCE",
        targetId: evidence.id,
        note: null,
        createdById: null,
      });
      await modules!.qualification.linkQualificationEvidence(
        qualification.id,
        evidence.id,
        null,
        null,
      );

      const repository = new modules!.graph.EngineeringGraphRepository();

      const fromItem = await repository.getOutgoingEdges(
        tenant.projectId,
        [{ type: "SUPPLIED_ITEM", id: item.id }],
        ["SUPPLIED_ITEM_HAS_EVIDENCE"],
      );
      expect(fromItem.map((e) => e.target.id)).toEqual([evidence.id]);

      const fromQualification = await repository.getOutgoingEdges(
        tenant.projectId,
        [{ type: "SUPPLIER_QUALIFICATION", id: qualification.id }],
        ["SUPPLIER_QUALIFICATION_HAS_EVIDENCE"],
      );
      expect(fromQualification.map((e) => e.target.id)).toEqual([evidence.id]);
    });

    it("fails closed on a link whose other end is in another project", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const foreignDesign = await makeDesignItem(otherTenant.projectId);

      await integrationPrisma!.suppliedItemDesignLink.create({
        data: { suppliedItemId: item.id, designItemId: foreignDesign.id },
      });

      const repository = new modules!.graph.EngineeringGraphRepository();
      const edges = await repository.getOutgoingEdges(
        tenant.projectId,
        [{ type: "SUPPLIED_ITEM", id: item.id }],
        ["SUPPLIED_ITEM_ALLOCATED_TO_DESIGN"],
      );

      // The graph never quietly crosses a project boundary.
      expect(edges).toEqual([]);
    });

    it("reports the cross-project row as an anomaly rather than repairing it", async () => {
      const supplier = await makeSupplier();
      const item = await makeItem(supplier.id);
      const foreignDesign = await makeDesignItem(otherTenant.projectId);

      const row = await integrationPrisma!.suppliedItemDesignLink.create({
        data: { suppliedItemId: item.id, designItemId: foreignDesign.id },
      });

      const repository = new modules!.graph.EngineeringGraphRepository();
      const audit = await repository.auditEdges(tenant.projectId, [
        "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
      ]);

      const found = (audit.get("SUPPLIED_ITEM_ALLOCATED_TO_DESIGN") ?? []).find(
        (edge) => edge.relationshipId === row.id,
      );
      expect(found?.targetProjectId).toBe(otherTenant.projectId);
    });

    it("supplies revision stamps for supplier nodes", async () => {
      const supplier = await makeSupplier();

      const repository = new modules!.graph.EngineeringGraphRepository();
      const revisions = await repository.getNodeRevisions(tenant.projectId, [
        { type: "SUPPLIER", id: supplier.id },
      ]);

      expect(revisions.get(`SUPPLIER:${supplier.id}`)).toBeInstanceOf(Date);
    });
  });

  // --- Audit ---------------------------------------------------------------

  describe("audit rows", () => {
    it("round-trips a supplier audit event", async () => {
      const supplier = await makeSupplier();

      await modules!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "supplier.created",
        entityType: "Supplier",
        entityId: supplier.id,
        metadata: { identifier: supplier.identifier, projectId: tenant.projectId },
      });

      const events = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "Supplier",
        entityId: supplier.id,
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("supplier.created");
      expect(events[0]?.actor?.id).toBe(tenant.userId);
    });

    it("does not return another organization's audit events", async () => {
      const supplier = await makeSupplier();

      await modules!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "supplier.created",
        entityType: "Supplier",
        entityId: supplier.id,
        metadata: {},
      });

      const events = await modules!.audit.listAuditEventsForEntity({
        organizationId: otherTenant.organizationId,
        entityType: "Supplier",
        entityId: supplier.id,
      });

      expect(events).toEqual([]);
    });
  });

  // --- Project isolation ---------------------------------------------------

  describe("project isolation", () => {
    it("does not return another project's suppliers", async () => {
      const mine = await makeSupplier();
      const theirs = await makeSupplier(otherTenant.projectId, "theirs");

      const list = await modules!.supplier.listSuppliersInProject(tenant.projectId);

      expect(list.some((row) => row.id === mine.id)).toBe(true);
      expect(list.some((row) => row.id === theirs.id)).toBe(false);
    });

    it("does not resolve another project's supplier by id", async () => {
      const theirs = await makeSupplier(otherTenant.projectId, "theirs");

      expect(
        await modules!.supplier.findSupplierInProject(tenant.projectId, theirs.id),
      ).toBeNull();
    });

    it("does not resolve another project's supplied item or qualification by id", async () => {
      const supplier = await makeSupplier(otherTenant.projectId, "theirs");
      const item = await makeItem(supplier.id, otherTenant.projectId, "theirs");
      const qualification = await modules!.qualification.createSupplierQualification({
        projectId: otherTenant.projectId,
        supplierId: supplier.id,
        suppliedItemId: item.id,
        title: "Theirs",
        qualificationType: "MATERIAL",
        evidenceReference: null,
        effectiveDate: null,
        expiryDate: null,
      });

      expect(
        await modules!.item.findSuppliedItemInProject(tenant.projectId, item.id),
      ).toBeNull();
      expect(
        await modules!.qualification.findQualificationInProject(
          tenant.projectId,
          qualification.id,
        ),
      ).toBeNull();
    });

    it("removes suppliers when the project is deleted", async () => {
      const scratch = await createTestTenant("supplier-cascade");
      const supplier = await makeSupplier(scratch.projectId, "scratch");

      await integrationPrisma!.project.delete({ where: { id: scratch.projectId } });

      const found = await integrationPrisma!.supplier.findUnique({ where: { id: supplier.id } });
      expect(found).toBeNull();

      await destroyTestTenant(scratch);
    });
  });
});
