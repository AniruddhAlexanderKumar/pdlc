// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SuppliedItem, Supplier, SupplierQualification } from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Supplier route handlers, driven through the *real* services with only
 * repositories and the transaction faked. Validation, parent integrity, tenancy
 * and status mapping are genuinely exercised without PostgreSQL.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
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

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const supplierRepository = await import("@/server/repositories/supplier.repository");
const itemRepository = await import("@/server/repositories/supplied-item.repository");
const qualificationRepository = await import(
  "@/server/repositories/supplier-qualification.repository"
);
const artifactsRepository = await import("@/server/repositories/project-artifacts.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const suppliersCollection = await import("@/app/api/projects/[projectId]/suppliers/route");
const supplierItem = await import("@/app/api/projects/[projectId]/suppliers/[supplierId]/route");
const itemsCollection = await import("@/app/api/projects/[projectId]/supplied-items/route");
const itemDetail = await import(
  "@/app/api/projects/[projectId]/supplied-items/[suppliedItemId]/route"
);
const itemLinks = await import(
  "@/app/api/projects/[projectId]/supplied-items/[suppliedItemId]/links/route"
);
const linkTargets = await import(
  "@/app/api/projects/[projectId]/supplied-item-link-targets/route"
);
const qualsCollection = await import(
  "@/app/api/projects/[projectId]/supplier-qualifications/route"
);
const qualDetail = await import(
  "@/app/api/projects/[projectId]/supplier-qualifications/[qualificationId]/route"
);
const qualEvidence = await import(
  "@/app/api/projects/[projectId]/supplier-qualifications/[qualificationId]/evidence/route"
);

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
  description: null,
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
  title: "VIM qualification",
  qualificationType: "MATERIAL",
  status: "ACTIVE",
  evidenceReference: "QMS-2026-114",
  effectiveDate: null,
  expiryDate: null,
  createdAt: new Date("2026-01-04T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
};

const BASE = `http://localhost/api/projects/${PROJECT.id}`;

function request(method: string, body?: unknown, url = BASE): Request {
  return new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

const projectParams = { params: Promise.resolve({ projectId: PROJECT.id }) };
const supplierParams = {
  params: Promise.resolve({ projectId: PROJECT.id, supplierId: SUPPLIER.id }),
};
const itemParams = {
  params: Promise.resolve({ projectId: PROJECT.id, suppliedItemId: ITEM.id }),
};
const qualParams = {
  params: Promise.resolve({ projectId: PROJECT.id, qualificationId: QUALIFICATION.id }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
});

// --- Authentication ---------------------------------------------------------

describe("authentication", () => {
  it("401s every supplier route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    const responses = await Promise.all([
      suppliersCollection.GET(request("GET"), projectParams),
      suppliersCollection.POST(request("POST", { identifier: "SUP-001", name: "X" }), projectParams),
      supplierItem.GET(request("GET"), supplierParams),
      supplierItem.PATCH(request("PATCH", { name: "X" }), supplierParams),
      itemsCollection.GET(request("GET"), projectParams),
      itemDetail.GET(request("GET"), itemParams),
      itemLinks.POST(
        request("POST", { relation: "DESIGN_ITEM", targetId: "d1" }),
        itemParams,
      ),
      linkTargets.GET(request("GET"), projectParams),
      qualsCollection.GET(request("GET"), projectParams),
      qualDetail.GET(request("GET"), qualParams),
      qualEvidence.POST(request("POST", { evidenceId: "e1" }), qualParams),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });

  it("never reaches a repository when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001", name: "X" }),
      projectParams,
    );

    expect(supplierRepository.createSupplier).not.toHaveBeenCalled();
    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
  });
});

// --- Suppliers --------------------------------------------------------------

describe("POST /suppliers", () => {
  it("creates a supplier and returns 201", async () => {
    vi.mocked(supplierRepository.createSupplier).mockResolvedValue(SUPPLIER);

    const response = await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001", name: "Vulcan Alloys" }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.supplier.identifier).toBe("SUP-001");
  });

  it("takes the project from the path, never from the body", async () => {
    const response = await suppliersCollection.POST(
      request("POST", {
        identifier: "SUP-001",
        name: "Vulcan Alloys",
        projectId: "someone-elses-project",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(supplierRepository.createSupplier).not.toHaveBeenCalled();
  });

  it("400s when the caller tries to supply an organization", async () => {
    const response = await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001", name: "X", organizationId: "org2" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001", name: "X" }),
      projectParams,
    );

    expect(response.status).toBe(404);
  });

  it("409s on a duplicate identifier", async () => {
    vi.mocked(supplierRepository.createSupplier).mockRejectedValue(
      new ConflictError("Supplier SUP-001 already exists in this project."),
    );

    const response = await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001", name: "X" }),
      projectParams,
    );

    expect(response.status).toBe(409);
  });

  it("400s on a malformed body", async () => {
    const response = await suppliersCollection.POST(
      request("POST", { identifier: "SUP-001" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });
});

describe("GET /suppliers", () => {
  it("returns the list with real counts", async () => {
    vi.mocked(supplierRepository.listSuppliersInProject).mockResolvedValue([
      { ...SUPPLIER, suppliedItemCount: 3, qualificationCount: 1 },
    ]);

    const response = await suppliersCollection.GET(request("GET"), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suppliers[0].suppliedItemCount).toBe(3);
  });

  it("passes a status filter through", async () => {
    vi.mocked(supplierRepository.listSuppliersInProject).mockResolvedValue([]);

    await suppliersCollection.GET(
      request("GET", undefined, `${BASE}/suppliers?status=UNDER_REVIEW`),
      projectParams,
    );

    expect(supplierRepository.listSuppliersInProject).toHaveBeenCalledWith(PROJECT.id, {
      status: "UNDER_REVIEW",
    });
  });

  it("400s on a status the domain does not define", async () => {
    const response = await suppliersCollection.GET(
      request("GET", undefined, `${BASE}/suppliers?status=PREFERRED`),
      projectParams,
    );

    expect(response.status).toBe(400);
  });
});

describe("GET/PATCH /suppliers/[supplierId]", () => {
  it("returns one supplier in full", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.listSuppliedItemsInProject).mockResolvedValue([]);
    vi.mocked(qualificationRepository.listQualificationsInProject).mockResolvedValue([]);

    const response = await supplierItem.GET(request("GET"), supplierParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.supplier.identifier).toBe("SUP-001");
  });

  it("404s for a supplier belonging to another project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(null);

    const response = await supplierItem.GET(request("GET"), supplierParams);

    expect(response.status).toBe(404);
  });

  it("400s when a PATCH tries to change the identifier", async () => {
    const response = await supplierItem.PATCH(
      request("PATCH", { identifier: "SUP-002" }),
      supplierParams,
    );

    expect(response.status).toBe(400);
  });
});

// --- Supplied items ---------------------------------------------------------

describe("POST /supplied-items", () => {
  it("creates an item under a supplier in the same project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.createSuppliedItem).mockResolvedValue(ITEM);

    const response = await itemsCollection.POST(
      request("POST", {
        supplierId: SUPPLIER.id,
        identifier: "SI-001",
        name: "Inconel 718 billet",
        itemType: "MATERIAL",
      }),
      projectParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s when the supplier is in another project", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(null);

    const response = await itemsCollection.POST(
      request("POST", {
        supplierId: "sup-in-another-project",
        identifier: "SI-001",
        name: "Billet",
        itemType: "MATERIAL",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(itemRepository.createSuppliedItem).not.toHaveBeenCalled();
  });

  it("400s on an item type the domain does not define", async () => {
    const response = await itemsCollection.POST(
      request("POST", {
        supplierId: SUPPLIER.id,
        identifier: "SI-001",
        name: "Billet",
        itemType: "FASTENER",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("passes filters through", async () => {
    vi.mocked(itemRepository.listSuppliedItemsInProject).mockResolvedValue([]);

    await itemsCollection.GET(
      request(
        "GET",
        undefined,
        `${BASE}/supplied-items?supplierId=${SUPPLIER.id}&itemType=MATERIAL&status=ACTIVE`,
      ),
      projectParams,
    );

    expect(itemRepository.listSuppliedItemsInProject).toHaveBeenCalledWith(PROJECT.id, {
      supplierId: SUPPLIER.id,
      itemType: "MATERIAL",
      status: "ACTIVE",
    });
  });
});

describe("supplied item relationships", () => {
  beforeEach(() => {
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.listSuppliedItemLinks).mockResolvedValue([]);
  });

  it("records a link and returns 201", async () => {
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(true);
    vi.mocked(itemRepository.linkSuppliedItem).mockResolvedValue("rel1");

    const response = await itemLinks.POST(
      request("POST", { relation: "DESIGN_ITEM", targetId: "design1" }),
      itemParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s when the target is in another project", async () => {
    vi.mocked(itemRepository.suppliedItemLinkTargetExists).mockResolvedValue(false);

    const response = await itemLinks.POST(
      request("POST", { relation: "DESIGN_ITEM", targetId: "design-elsewhere" }),
      itemParams,
    );

    expect(response.status).toBe(400);
    expect(itemRepository.linkSuppliedItem).not.toHaveBeenCalled();
  });

  it("400s on a relation the domain does not declare", async () => {
    const response = await itemLinks.POST(
      request("POST", { relation: "CHANGE_REQUEST", targetId: "cr1" }),
      itemParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s when a caller tries to smuggle a project into the link body", async () => {
    const response = await itemLinks.POST(
      request("POST", { relation: "DESIGN_ITEM", targetId: "d1", projectId: "other" }),
      itemParams,
    );

    expect(response.status).toBe(400);
  });

  it("removes a link", async () => {
    vi.mocked(itemRepository.unlinkSuppliedItem).mockResolvedValue(true);

    const response = await itemLinks.DELETE(
      request("DELETE", { relation: "RISK", targetId: "risk1" }),
      itemParams,
    );

    expect(response.status).toBe(200);
  });

  it("404s when removing a link that is not recorded", async () => {
    vi.mocked(itemRepository.unlinkSuppliedItem).mockResolvedValue(false);

    const response = await itemLinks.DELETE(
      request("DELETE", { relation: "RISK", targetId: "risk1" }),
      itemParams,
    );

    expect(response.status).toBe(404);
  });

  it("offers only project-scoped link targets", async () => {
    vi.mocked(artifactsRepository.listSuppliedItemLinkTargets).mockResolvedValue({
      DESIGN_ITEM: [],
      REQUIREMENT: [],
      VERIFICATION_ACTIVITY: [],
      ENGINEERING_DECISION: [],
      RISK: [],
      EVIDENCE: [],
    });

    const response = await linkTargets.GET(request("GET"), projectParams);

    expect(response.status).toBe(200);
    expect(artifactsRepository.listSuppliedItemLinkTargets).toHaveBeenCalledWith(PROJECT.id);
  });
});

// --- Qualifications ---------------------------------------------------------

describe("POST /supplier-qualifications", () => {
  it("creates a source qualification", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(qualificationRepository.createSupplierQualification).mockResolvedValue(
      QUALIFICATION,
    );

    const response = await qualsCollection.POST(
      request("POST", {
        supplierId: SUPPLIER.id,
        title: "Approved source",
        qualificationType: "SOURCE",
      }),
      projectParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s when the supplied item belongs to a different supplier", async () => {
    vi.mocked(supplierRepository.findSupplierInProject).mockResolvedValue(SUPPLIER);
    vi.mocked(itemRepository.findSuppliedItemInProject).mockResolvedValue({
      ...ITEM,
      supplierId: "another-supplier",
    });

    const response = await qualsCollection.POST(
      request("POST", {
        supplierId: SUPPLIER.id,
        suppliedItemId: ITEM.id,
        title: "VIM qualification",
        qualificationType: "MATERIAL",
      }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/not provided by the supplier/i);
  });

  it("400s on a status the domain does not define", async () => {
    const response = await qualsCollection.POST(
      request("POST", {
        supplierId: SUPPLIER.id,
        title: "Approved source",
        qualificationType: "SOURCE",
        status: "CERTIFIED",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /supplier-qualifications/[qualificationId]", () => {
  beforeEach(() => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(
      QUALIFICATION,
    );
  });

  it("lets a person record a status change", async () => {
    vi.mocked(qualificationRepository.updateSupplierQualification).mockResolvedValue({
      ...QUALIFICATION,
      status: "WITHDRAWN",
    });

    const response = await qualDetail.PATCH(
      request("PATCH", { status: "WITHDRAWN" }),
      qualParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.qualification.status).toBe("WITHDRAWN");
  });

  it("400s when a caller tries to move either parent", async () => {
    const bySupplier = await qualDetail.PATCH(
      request("PATCH", { supplierId: "sup2" }),
      qualParams,
    );
    const byItem = await qualDetail.PATCH(
      request("PATCH", { suppliedItemId: "item2" }),
      qualParams,
    );

    expect(bySupplier.status).toBe(400);
    expect(byItem.status).toBe(400);
  });

  it("404s for a qualification belonging to another project", async () => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(null);

    const response = await qualDetail.GET(request("GET"), qualParams);

    expect(response.status).toBe(404);
  });
});

describe("qualification evidence", () => {
  beforeEach(() => {
    vi.mocked(qualificationRepository.findQualificationInProject).mockResolvedValue(
      QUALIFICATION,
    );
    vi.mocked(qualificationRepository.listQualificationEvidence).mockResolvedValue([]);
  });

  it("attaches evidence that exists in the project", async () => {
    vi.mocked(qualificationRepository.evidenceExistsInProject).mockResolvedValue(true);
    vi.mocked(qualificationRepository.linkQualificationEvidence).mockResolvedValue("rel1");

    const response = await qualEvidence.POST(
      request("POST", { evidenceId: "ev1" }),
      qualParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s for evidence from another project", async () => {
    vi.mocked(qualificationRepository.evidenceExistsInProject).mockResolvedValue(false);

    const response = await qualEvidence.POST(
      request("POST", { evidenceId: "ev-elsewhere" }),
      qualParams,
    );

    expect(response.status).toBe(400);
  });
});

// --- What the API never exposes ---------------------------------------------

describe("what the supplier API never exposes", () => {
  it("offers no procurement route", async () => {
    // There is no order, invoice, contract or vendor-scoring handler anywhere in
    // these modules. Asserted structurally so adding one is a deliberate act.
    const modules = [suppliersCollection, supplierItem, itemsCollection, itemDetail, qualDetail];
    const handlers = modules.flatMap((module) => Object.keys(module));

    expect(handlers.sort()).toEqual(
      expect.arrayContaining(["GET", "PATCH", "POST"]),
    );
    for (const name of handlers) {
      expect(["GET", "POST", "PATCH", "DELETE", "dynamic"]).toContain(name);
    }
  });

  it("returns no supplier score or rating in any payload", async () => {
    vi.mocked(supplierRepository.listSuppliersInProject).mockResolvedValue([
      { ...SUPPLIER, suppliedItemCount: 1, qualificationCount: 1 },
    ]);

    const response = await suppliersCollection.GET(request("GET"), projectParams);
    const body = await response.json();

    expect(JSON.stringify(body)).not.toMatch(/score|rating|health|tier|preferred/i);
  });
});
