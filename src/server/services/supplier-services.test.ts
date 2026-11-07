// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SuppliedItem, Supplier, SupplierQualification } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Supplier engineering service behaviour, against fake repositories: no
 * database, no Prisma. The transaction sentinel proves each mutation and its
 * audit event are handed the same client, so a write cannot be recorded without
 * its audit row or the reverse.
 *
 * Most of these tests are about a single property: **no id a caller supplies is
 * ever trusted**. Every parent and every link target is re-resolved inside the
 * already-scoped project before anything is written, because a cross-project
 * link is how a change declared in one project would reach objects in another.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/supplier.repository", () => ({
  createSupplier: vi.fn(),
  findSupplierInProject: vi.fn(),
  listSuppliersInProject: vi.fn(),
  updateSupplier: vi.fn(),
}));

vi.mock("@/server/repositories/supplied-item.repository", () => ({
  createSuppliedItem: vi.fn(),
  findSuppliedItemInProject: vi.fn(),
  listSuppliedItemsInProject: vi.fn(),
  updateSuppliedItem: vi.fn(),
  suppliedItemLinkTargetExists: vi.fn(),
  linkSuppliedItem: vi.fn(),
  unlinkSuppliedItem: vi.fn(),
  listSuppliedItemLinks: vi.fn(),
}));

vi.mock("@/server/repositories/supplier-qualification.repository", () => ({
  createSupplierQualification: vi.fn(),
  findQualificationInProject: vi.fn(),
  listQualificationsInProject: vi.fn(),
  updateSupplierQualification: vi.fn(),
  linkQualificationEvidence: vi.fn(),
  unlinkQualificationEvidence: vi.fn(),
  listQualificationEvidence: vi.fn(),
  evidenceExistsInProject: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listSuppliedItemLinkTargets: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const supplierRepository = await import("@/server/repositories/supplier.repository");
const itemRepository = await import("@/server/repositories/supplied-item.repository");
const qualificationRepository = await import(
  "@/server/repositories/supplier-qualification.repository"
);
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const supplierService = await import("./supplier.service");
const itemService = await import("./supplied-item.service");
const qualificationService = await import("./supplier-qualification.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const SUPPLIER: Supplier = {
  id: "sup1aaaaaaaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  identifier: "SUP-001",
  name: "Vulcan Alloys",
  description: "Nickel superalloy forgings.",
  status: "ACTIVE",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const ITEM: SuppliedItem = {
  id: "item1aaaaaaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  supplierId: SUPPLIER.id,
  identifier: "SI-001",
  name: "Inconel 718 billet",
  description: null,
  itemType: "MATERIAL",
  status: "ACTIVE",
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const QUALIFICATION: SupplierQualification = {
  id: "qual1aaaaaaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  supplierId: SUPPLIER.id,
  suppliedItemId: ITEM.id,
  title: "Vacuum induction melt qualification",
  qualificationType: "MATERIAL",
  status: "ACTIVE",
  evidenceReference: "QMS-2026-114",
  effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
  expiryDate: new Date("2027-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-04T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  // CONTEXT's actor is a MANAGER on PROJECT by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior
  // do not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

// --- Supplier ---------------------------------------------------------------

describe("SupplierService.createSupplier", () => {
  it("creates the supplier and audits it on the same transaction", async () => {
    vi.mocked(supplierRepository.createSupplier).mockResolvedValue(SUPPLIER);

    const created = await supplierService.createSupplier(CONTEXT, PROJECT.id, {
      identifier: "SUP-001",
      name: "Vulcan Alloys",
    });

    expect(created).toEqual(SUPPLIER);
    expect(supplierRepository.createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id, identifier: "SUP-001" }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "supplier.created",
        entityType: "Supplier",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("takes the project from the argument, never from the body", async () => {
    await expect(
      supplierService.createSupplier(CONTEXT, PROJECT.id, {
        identifier: "SUP-001",
        name: "Vulcan Alloys",
        projectId: "someone-elses-project",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(supplierRepository.createSupplier).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(supplierRepository.createSupplier).mockRejectedValue(
      new ConflictError("Supplier SUP-001 already exists in this project."),
    );

    await expect(
      supplierService.createSupplier(CONTEXT, PROJECT.id, {
        identifier: "SUP-001",
        name: "Vulcan Alloys",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      supplierService.createSupplier(CONTEXT, "other-project", {
        identifier: "SUP-001",
        name: "Vulcan Alloys",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(supplierRepository.createSupplier).not.toHaveBeenCalled();
  });
});

describe("SupplierService.updateSupplier", () => {
  it("updates and audits the previous status", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(supplierRepository.updateSupplier).mockResolvedValue({
      ...SUPPLIER,
      status: "INACTIVE",
    });

    await supplierService.updateSupplier(CONTEXT, PROJECT.id, SUPPLIER.id, {
      status: "INACTIVE",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "supplier.updated",
        metadata: expect.objectContaining({ previousStatus: "ACTIVE" }),
      }),
      TX,
    );
  });

  it("never touches a qualification when the supplier's status changes", async () => {
    // Supplier ACTIVE with qualification EXPIRED is a real state the system
    // preserves. Deriving one from the other would destroy the distinction
    // between "we stopped using them" and "the qualification lapsed".
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(supplierRepository.updateSupplier).mockResolvedValue({
      ...SUPPLIER,
      status: "INACTIVE",
    });

    await supplierService.updateSupplier(CONTEXT, PROJECT.id, SUPPLIER.id, {
      status: "INACTIVE",
    });

    expect(qualificationRepository.updateSupplierQualification).not.toHaveBeenCalled();
  });

  it("404s for a supplier in another project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(null);

    await expect(
      supplierService.updateSupplier(CONTEXT, PROJECT.id, "sup-elsewhere", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("scopes the detail read to the project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.listSuppliedItemsInProject).mockResolvedValue([]);
    vi.mocked(qualificationRepository.listQualificationsInProject).mockResolvedValue([]);

    await supplierService.getSupplier(CONTEXT, PROJECT.id, SUPPLIER.id);

    expect(supplierRepository.findSupplierInProject).toHaveBeenCalledWith(
      PROJECT.id,
      SUPPLIER.id,
      undefined,
    );
    expect(itemRepository.listSuppliedItemsInProject).toHaveBeenCalledWith(PROJECT.id, {
      supplierId: SUPPLIER.id,
    });
  });
});

// --- Supplied item ----------------------------------------------------------

describe("SuppliedItemService.createSuppliedItem", () => {
  it("creates the item once its supplier is proved to be in the project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.createSuppliedItem).mockResolvedValue(ITEM);

    const created = await itemService.createSuppliedItem(CONTEXT, PROJECT.id, {
      supplierId: SUPPLIER.id,
      identifier: "SI-001",
      name: "Inconel 718 billet",
      itemType: "MATERIAL",
    });

    expect(created).toEqual(ITEM);
    // Validated inside the transaction, so the supplier cannot vanish between
    // the check and the write.
    expect(supplierRepository.findSupplierInProject).toHaveBeenCalledWith(
      PROJECT.id,
      SUPPLIER.id,
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "supplied_item.created" }),
      TX,
    );
  });

  it("rejects a supplier from another project", async () => {
    // The security boundary: without this an item could be attached to a
    // supplier the caller cannot see.
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(null);

    await expect(
      itemService.createSuppliedItem(CONTEXT, PROJECT.id, {
        supplierId: "sup-in-another-project",
        identifier: "SI-001",
        name: "Inconel 718 billet",
        itemType: "MATERIAL",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(itemRepository.createSuppliedItem).not.toHaveBeenCalled();
  });

  it("refuses a project outside the caller's organization before reading anything", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      itemService.createSuppliedItem(CONTEXT, "other-project", {
        supplierId: SUPPLIER.id,
        identifier: "SI-001",
        name: "Billet",
        itemType: "MATERIAL",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(supplierRepository.findSupplierInProject).not.toHaveBeenCalled();
  });
});

describe("SuppliedItemService.updateSuppliedItem", () => {
  it("updates and audits", async () => {
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.updateSuppliedItem).mockResolvedValue({
      ...ITEM,
      status: "OBSOLETE",
    });

    await itemService.updateSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, { status: "OBSOLETE" });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "supplied_item.updated",
        metadata: expect.objectContaining({ previousStatus: "ACTIVE" }),
      }),
      TX,
    );
  });

  it("404s for an item in another project", async () => {
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(null);

    await expect(
      itemService.updateSuppliedItem(CONTEXT, PROJECT.id, "item-elsewhere", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SuppliedItemService relationships", () => {
  beforeEach(() => {
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.listSuppliedItemLinks).mockResolvedValue([]);
  });

  it("records a valid link and audits it", async () => {
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(true);
    vi.mocked(itemRepository.linkSuppliedItem).mockResolvedValue("rel1");

    await itemService.linkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
      relation: "DESIGN_ITEM",
      targetId: "design1",
    });

    expect(itemRepository.linkSuppliedItem).toHaveBeenCalledWith(
      expect.objectContaining({
        suppliedItemId: ITEM.id,
        relation: "DESIGN_ITEM",
        targetId: "design1",
        // The actor comes from the session, never from the request body.
        createdById: CONTEXT.actorId,
      }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "supplied_item.linked",
        metadata: expect.objectContaining({ relation: "DESIGN_ITEM", relationshipId: "rel1" }),
      }),
      TX,
    );
  });

  it("refuses a target in another project", async () => {
    // Without this a caller could link to another project's design item and
    // then reach that project's objects through an impact analysis.
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(false);

    await expect(
      itemService.linkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
        relation: "DESIGN_ITEM",
        targetId: "design-in-another-project",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(itemRepository.linkSuppliedItem).not.toHaveBeenCalled();
  });

  it("validates the target against the project the item is in", async () => {
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(true);
    vi.mocked(itemRepository.linkSuppliedItem).mockResolvedValue("rel1");

    await itemService.linkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
      relation: "REQUIREMENT",
      targetId: "req1",
    });

    expect(itemRepository.suppliedItemLinkTargetExists).toHaveBeenCalledWith(
      "REQUIREMENT",
      "req1",
      PROJECT.id,
      TX,
    );
  });

  it("surfaces a duplicate link as a conflict", async () => {
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(true);
    vi.mocked(itemRepository.linkSuppliedItem).mockRejectedValue(
      new ConflictError("That relationship is already recorded for this supplied item."),
    );

    await expect(
      itemService.linkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
        relation: "DESIGN_ITEM",
        targetId: "design1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a relation the domain does not declare", async () => {
    await expect(
      itemService.linkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
        relation: "CHANGE_REQUEST",
        targetId: "cr1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(itemRepository.suppliedItemLinkTargetExists).not.toHaveBeenCalled();
  });

  it("removes a link and audits it", async () => {
    vi.mocked(itemRepository.unlinkSuppliedItem).mockResolvedValue(true);

    await itemService.unlinkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
      relation: "RISK",
      targetId: "risk1",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "supplied_item.unlinked" }),
      TX,
    );
  });

  it("404s when removing a link that is not there", async () => {
    vi.mocked(itemRepository.unlinkSuppliedItem).mockResolvedValue(false);

    await expect(
      itemService.unlinkSuppliedItem(CONTEXT, PROJECT.id, ITEM.id, {
        relation: "RISK",
        targetId: "risk1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// --- Qualification ----------------------------------------------------------

describe("SupplierQualificationService.createSupplierQualification", () => {
  it("creates a source qualification with no supplied item", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(qualificationRepository.createSupplierQualification).mockResolvedValue({
      ...QUALIFICATION,
      suppliedItemId: null,
      qualificationType: "SOURCE",
    });

    await qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
      supplierId: SUPPLIER.id,
      title: "Approved source",
      qualificationType: "SOURCE",
    });

    expect(qualificationRepository.createSupplierQualification).toHaveBeenCalledWith(
      expect.objectContaining({ suppliedItemId: null }),
      TX,
    );
    expect(itemRepository.findSuppliedItemInProject).not.toHaveBeenCalled();
  });

  it("creates an item-scoped qualification when the item belongs to the supplier", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(ITEM);
    vi.mocked(qualificationRepository.createSupplierQualification).mockResolvedValue(
      QUALIFICATION,
    );

    await qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
      supplierId: SUPPLIER.id,
      suppliedItemId: ITEM.id,
      title: "VIM qualification",
      qualificationType: "MATERIAL",
    });

    expect(qualificationRepository.createSupplierQualification).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: SUPPLIER.id, suppliedItemId: ITEM.id }),
      TX,
    );
  });

  it("rejects an item that belongs to a different supplier", async () => {
    // The mismatch check. Without it the record would assert that one
    // supplier's qualification covers another supplier's item.
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue({
      ...ITEM,
      supplierId: "a-different-supplier",
    });

    await expect(
      qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
        supplierId: SUPPLIER.id,
        suppliedItemId: ITEM.id,
        title: "VIM qualification",
        qualificationType: "MATERIAL",
      }),
    ).rejects.toThrow(/not provided by the supplier/i);

    expect(qualificationRepository.createSupplierQualification).not.toHaveBeenCalled();
  });

  it("rejects a supplier from another project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(null);

    await expect(
      qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
        supplierId: "sup-elsewhere",
        title: "Approved source",
        qualificationType: "SOURCE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a supplied item from another project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(null);

    await expect(
      qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
        supplierId: SUPPLIER.id,
        suppliedItemId: "item-elsewhere",
        title: "VIM qualification",
        qualificationType: "MATERIAL",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("parses dates on the server, never trusting a client Date", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(qualificationRepository.createSupplierQualification).mockResolvedValue(
      QUALIFICATION,
    );

    await qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
      supplierId: SUPPLIER.id,
      title: "Approved source",
      qualificationType: "SOURCE",
      effectiveDate: "2026-03-01T00:00:00.000Z",
    });

    const call = vi.mocked(qualificationRepository.createSupplierQualification).mock.calls[0]![0];
    expect(call.effectiveDate).toBeInstanceOf(Date);
    expect(call.effectiveDate?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("SupplierQualificationService.updateSupplierQualification", () => {
  beforeEach(() => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(
      QUALIFICATION,
    );
  });

  it("audits a status change as its own action, with both values", async () => {
    vi.mocked(qualificationRepository.updateSupplierQualification).mockResolvedValue({
      ...QUALIFICATION,
      status: "WITHDRAWN",
    });

    await qualificationService.updateSupplierQualification(
      CONTEXT,
      PROJECT.id,
      QUALIFICATION.id,
      { status: "WITHDRAWN" },
    );

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "supplier_qualification.status_changed",
        metadata: expect.objectContaining({ previousStatus: "ACTIVE", status: "WITHDRAWN" }),
      }),
      TX,
    );
  });

  it("audits an ordinary edit as an update", async () => {
    vi.mocked(qualificationRepository.updateSupplierQualification).mockResolvedValue(
      QUALIFICATION,
    );

    await qualificationService.updateSupplierQualification(
      CONTEXT,
      PROJECT.id,
      QUALIFICATION.id,
      { title: "Revised title" },
    );

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "supplier_qualification.updated" }),
      TX,
    );
  });

  it("never derives EXPIRED from a past expiry date", async () => {
    // Change detected is not failure proven. Writing an expiry date in the past
    // leaves the status exactly where the person left it.
    vi.mocked(qualificationRepository.updateSupplierQualification).mockResolvedValue(
      QUALIFICATION,
    );

    await qualificationService.updateSupplierQualification(
      CONTEXT,
      PROJECT.id,
      QUALIFICATION.id,
      { expiryDate: "2020-01-01T00:00:00.000Z" },
    );

    const call = vi.mocked(qualificationRepository.updateSupplierQualification).mock.calls[0]![1];
    expect(call.expiryDate).toBeInstanceOf(Date);
    expect(call.status).toBeUndefined();
  });

  it("404s for a qualification in another project", async () => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(null);

    await expect(
      qualificationService.updateSupplierQualification(CONTEXT, PROJECT.id, "qual-elsewhere", {
        title: "X",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SupplierQualificationService evidence", () => {
  beforeEach(() => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(
      QUALIFICATION,
    );
    vi.mocked(qualificationRepository.listQualificationEvidence).mockResolvedValue([]);
  });

  it("attaches evidence that exists in the project, and audits it", async () => {
    vi.mocked(qualificationRepository.evidenceExistsInProject).mockResolvedValue(true);
    vi.mocked(qualificationRepository.linkQualificationEvidence).mockResolvedValue("rel1");

    await qualificationService.linkQualificationEvidence(
      CONTEXT,
      PROJECT.id,
      QUALIFICATION.id,
      { evidenceId: "ev1" },
    );

    expect(qualificationRepository.linkQualificationEvidence).toHaveBeenCalledWith(
      QUALIFICATION.id,
      "ev1",
      null,
      CONTEXT.actorId,
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "supplier_qualification.evidence_linked" }),
      TX,
    );
  });

  it("rejects evidence from another project", async () => {
    vi.mocked(qualificationRepository.evidenceExistsInProject).mockResolvedValue(false);

    await expect(
      qualificationService.linkQualificationEvidence(CONTEXT, PROJECT.id, QUALIFICATION.id, {
        evidenceId: "ev-elsewhere",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(qualificationRepository.linkQualificationEvidence).not.toHaveBeenCalled();
  });

  it("404s when detaching evidence that is not attached", async () => {
    vi.mocked(qualificationRepository.unlinkQualificationEvidence).mockResolvedValue(false);

    await expect(
      qualificationService.unlinkQualificationEvidence(CONTEXT, PROJECT.id, QUALIFICATION.id, {
        evidenceId: "ev1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT.id,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating a supplier", async () => {
    asRole("VIEWER");
    await expect(
      supplierService.createSupplier(CONTEXT, PROJECT.id, { identifier: "SUP-001", name: "Vulcan Alloys" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(supplierRepository.createSupplier).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER updating a supplier — review authority is not write authority", async () => {
    asRole("REVIEWER");
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);

    await expect(
      supplierService.updateSupplier(CONTEXT, PROJECT.id, SUPPLIER.id, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to create a supplier", async () => {
    asRole("ENGINEER");
    vi.mocked(supplierRepository.createSupplier).mockResolvedValue(SUPPLIER);

    await expect(
      supplierService.createSupplier(CONTEXT, PROJECT.id, { identifier: "SUP-001", name: "Vulcan Alloys" }),
    ).resolves.toMatchObject({ identifier: "SUP-001" });
  });

  it("refuses a VIEWER creating a supplied item", async () => {
    asRole("VIEWER");
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);

    await expect(
      itemService.createSuppliedItem(CONTEXT, PROJECT.id, {
        supplierId: SUPPLIER.id,
        identifier: "SI-001",
        name: "Inconel 718 billet",
        itemType: "MATERIAL",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(itemRepository.createSuppliedItem).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to create a supplied item", async () => {
    asRole("ENGINEER");
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.createSuppliedItem).mockResolvedValue(ITEM);

    await expect(
      itemService.createSuppliedItem(CONTEXT, PROJECT.id, {
        supplierId: SUPPLIER.id,
        identifier: "SI-001",
        name: "Inconel 718 billet",
        itemType: "MATERIAL",
      }),
    ).resolves.toMatchObject({ identifier: "SI-001" });
  });

  it("refuses a VIEWER creating a supplier qualification", async () => {
    asRole("VIEWER");
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);

    await expect(
      qualificationService.createSupplierQualification(CONTEXT, PROJECT.id, {
        supplierId: SUPPLIER.id,
        title: "Vacuum induction melt qualification",
        qualificationType: "MATERIAL",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(qualificationRepository.createSupplierQualification).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER updating a qualification's status — no approval tier exists for this domain", async () => {
    asRole("REVIEWER");
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(QUALIFICATION);

    await expect(
      qualificationService.updateSupplierQualification(CONTEXT, PROJECT.id, QUALIFICATION.id, {
        status: "EXPIRED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to update a qualification's status — recorded, never approved", async () => {
    asRole("ENGINEER");
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(QUALIFICATION);
    vi.mocked(qualificationRepository.updateSupplierQualification).mockResolvedValue({
      ...QUALIFICATION,
      status: "EXPIRED",
    });

    await expect(
      qualificationService.updateSupplierQualification(CONTEXT, PROJECT.id, QUALIFICATION.id, {
        status: "EXPIRED",
      }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("allows a MANAGER to do all of the above", async () => {
    asRole("MANAGER");
    vi.mocked(supplierRepository.createSupplier).mockResolvedValue(SUPPLIER);
    await expect(
      supplierService.createSupplier(CONTEXT, PROJECT.id, { identifier: "SUP-001", name: "Vulcan Alloys" }),
    ).resolves.toMatchObject({ identifier: "SUP-001" });
  });
});
