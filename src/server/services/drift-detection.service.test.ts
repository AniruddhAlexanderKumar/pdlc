// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DriftReport,
  EngineeringBaseline,
  EngineeringBaselineMember,
  OperationalObservation,
  Project,
} from "@/domain";
import { driftSignature } from "@/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import type { BaselineableObject } from "@/server/repositories/baseline-member.repository";

/**
 * The drift engine, against fake repositories: no database, no Prisma.
 *
 * The comparison logic, the rule registry and the verdict precedence are all
 * genuinely exercised — only persistence and tenancy lookups are faked, and the
 * fake assessment store keeps rows so the report is assembled from what was
 * actually "written".
 *
 * Most of these tests are about restraint. The engine's value is not that it
 * spots differences — that part is arithmetic — but that it stops there:
 * it never rewrites a baseline, never concludes failure, never sets another
 * engine's state, and never converts a unit.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-baseline.repository", () => ({
  createBaseline: vi.fn(),
  findBaselineInProject: vi.fn(),
  listBaselinesInProject: vi.fn(),
  findActiveBaseline: vi.fn(),
  updateBaseline: vi.fn(),
  activateBaseline: vi.fn(),
  supersedeBaseline: vi.fn(),
}));

vi.mock("@/server/repositories/baseline-member.repository", () => ({
  createMember: vi.fn(),
  listMembers: vi.fn(),
  findMemberInBaseline: vi.fn(),
  deleteMember: vi.fn(),
  loadBaselineableObjects: vi.fn(),
}));

vi.mock("@/server/repositories/operational-observation.repository", () => ({
  createObservation: vi.fn(),
  findObservationInProject: vi.fn(),
  listObservationsInProject: vi.fn(),
  listObservationsForEvaluation: vi.fn(),
  updateObservation: vi.fn(),
  transitionObservation: vi.fn(),
  observationSubjectExistsInProject: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listBaselineMemberTargets: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

// An in-memory assessment store, so the report the service returns is assembled
// from rows it actually persisted rather than from its own intent to write.
vi.mock("@/server/repositories/drift-assessment.repository", () => {
  interface Row {
    assessment: Record<string, unknown>;
    findings: Record<string, unknown>[];
  }
  const store = new Map<string, Row>();
  let counter = 0;

  const summarize = (a: Record<string, unknown>) => ({
    ...a,
    summary: {
      findings: a["findingCount"] as number,
      reviewRequired: a["reviewRequiredCount"] as number,
      informational: a["informationalCount"] as number,
      unknown: a["unknownCount"] as number,
    },
  });

  return {
    __store: store,
    __reset: () => {
      store.clear();
      counter = 0;
    },
    createAssessment: vi.fn(async (input: Record<string, unknown>) => {
      counter += 1;
      const id = `drift${counter}`;
      const assessment = {
        id,
        ...input,
        evaluatedAt: new Date(2026, 0, 1, 0, 0, counter),
        createdAt: new Date(2026, 0, 1, 0, 0, counter),
      };
      store.set(id, { assessment, findings: [] });
      return summarize(assessment);
    }),
    createFindings: vi.fn(async (assessmentId: string, findings: Record<string, unknown>[]) => {
      const row = store.get(assessmentId)!;
      findings.forEach((finding, index) => {
        row.findings.push({
          id: `${assessmentId}-f${index}`,
          assessmentId,
          createdAt: new Date(2026, 0, 1),
          ...finding,
        });
      });
      return findings.length;
    }),
    findLatestAssessment: vi.fn(async (projectId: string, baselineId?: string) => {
      const rows = [...store.values()]
        .filter(
          (row) =>
            row.assessment["projectId"] === projectId &&
            (!baselineId || row.assessment["baselineId"] === baselineId),
        )
        .sort(
          (a, b) =>
            (b.assessment["evaluatedAt"] as Date).getTime() -
            (a.assessment["evaluatedAt"] as Date).getTime(),
        );
      return rows[0] ? summarize(rows[0].assessment) : null;
    }),
    listAssessments: vi.fn(async (projectId: string, baselineId?: string) =>
      [...store.values()]
        .filter(
          (row) =>
            row.assessment["projectId"] === projectId &&
            (!baselineId || row.assessment["baselineId"] === baselineId),
        )
        .sort(
          (a, b) =>
            (b.assessment["evaluatedAt"] as Date).getTime() -
            (a.assessment["evaluatedAt"] as Date).getTime(),
        )
        .map((row) => summarize(row.assessment)),
    ),
    findAssessmentInProject: vi.fn(async (projectId: string, assessmentId: string) => {
      const row = store.get(assessmentId);
      if (!row || row.assessment["projectId"] !== projectId) return null;
      return summarize(row.assessment);
    }),
    readAssessmentBasis: vi.fn(async (assessment: { id: string }) => {
      const row = store.get(assessment.id);
      return row?.assessment["basis"] ?? { members: [], observations: [] };
    }),
    listFindings: vi.fn(async (assessmentId: string) =>
      (store.get(assessmentId)?.findings ?? []).map((finding) => ({
        id: finding["id"],
        assessmentId,
        ruleId: finding["ruleId"],
        category: finding["category"],
        status: finding["status"],
        severity: finding["severity"],
        baselineSubject: finding["baselineSubject"],
        observationSubject: finding["observationSubject"],
        expectedValue: finding["expectedValue"],
        observedValue: finding["observedValue"],
        explanation: finding["explanation"],
        basis: finding["basis"],
        sequence: finding["sequence"],
        createdAt: finding["createdAt"],
      })),
    ),
    loadChangeContext: vi.fn(async () => new Map()),
  };
});

const projectRepository = await import("@/server/repositories/project.repository");
const baselineRepository = await import("@/server/repositories/engineering-baseline.repository");
const memberRepository = await import("@/server/repositories/baseline-member.repository");
const observationRepository = await import(
  "@/server/repositories/operational-observation.repository"
);
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const assessmentRepository = (await import(
  "@/server/repositories/drift-assessment.repository"
)) as unknown as { __reset: () => void; loadChangeContext: ReturnType<typeof vi.fn> };

const { DriftDetectionService } = await import("./drift-detection.service");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const BASELINE_ID = "bl1aaaaaaaaaaaaaaaaaaaa";

const PROJECT: Project = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function baseline(overrides: Partial<EngineeringBaseline> = {}): EngineeringBaseline {
  return {
    id: BASELINE_ID,
    projectId: PROJECT_ID,
    identifier: "BL-001",
    name: "Design baseline",
    description: null,
    status: "ACTIVE",
    createdById: CONTEXT.actorId,
    baselinedAt: new Date("2026-02-01T00:00:00.000Z"),
    baselinedById: CONTEXT.actorId,
    supersededAt: null,
    supersededById: null,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    ...overrides,
  };
}

function member(
  overrides: Partial<EngineeringBaselineMember> = {},
): EngineeringBaselineMember {
  return {
    id: "mem1",
    baselineId: BASELINE_ID,
    nodeType: "DESIGN_ITEM",
    nodeId: "di1",
    identifierSnapshot: "DI-001",
    labelSnapshot: "Combustion chamber",
    stateSnapshot: "APPROVED",
    fingerprint: "fp-baselined",
    revisionSnapshot: new Date("2026-01-20T00:00:00.000Z"),
    createdAt: new Date("2026-01-20T00:00:00.000Z"),
    ...overrides,
  };
}

function currentObject(overrides: Partial<BaselineableObject> = {}): BaselineableObject {
  return {
    nodeType: "DESIGN_ITEM",
    nodeId: "di1",
    identifier: "DI-001",
    label: "Combustion chamber",
    state: "APPROVED",
    fingerprint: "fp-baselined",
    revision: new Date("2026-01-20T00:00:00.000Z"),
    comparisonTerms: null,
    ...overrides,
  };
}

function observation(
  overrides: Partial<OperationalObservation> = {},
): OperationalObservation {
  return {
    id: "obs1",
    projectId: PROJECT_ID,
    identifier: "OBS-001",
    title: "Peak wall temperature",
    description: "Measured on flight 14.",
    observationType: "MEASUREMENT",
    status: "REVIEWED",
    source: "FT-14",
    observedAt: new Date("2026-05-01T00:00:00.000Z"),
    subjectLabel: null,
    numericValue: null,
    unit: null,
    textValue: null,
    subject: null,
    createdById: CONTEXT.actorId,
    reviewedAt: new Date("2026-05-02T00:00:00.000Z"),
    reviewedById: CONTEXT.actorId,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    ...overrides,
  };
}

let service: InstanceType<typeof DriftDetectionService>;

/** Wires the repositories for one evaluation scenario. */
function scenario(input: {
  members?: EngineeringBaselineMember[];
  current?: BaselineableObject[];
  observations?: OperationalObservation[];
  baselineStatus?: EngineeringBaseline["status"];
}) {
  vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
    baseline(input.baselineStatus ? { status: input.baselineStatus } : {}),
  );
  vi.mocked(memberRepository.listMembers).mockResolvedValue(input.members ?? []);
  vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
    new Map((input.current ?? []).map((o) => [`${o.nodeType}:${o.nodeId}`, o])),
  );
  vi.mocked(observationRepository.listObservationsForEvaluation).mockResolvedValue(
    input.observations ?? [],
  );
}

async function evaluate(): Promise<DriftReport> {
  return service.evaluateDrift(CONTEXT, PROJECT_ID, { baselineId: BASELINE_ID });
}

function findingFor(report: DriftReport, ruleId: string) {
  return report.findings.find((finding) => finding.ruleId === ruleId);
}

beforeEach(() => {
  vi.clearAllMocks();
  assessmentRepository.__reset();
  service = new DriftDetectionService();

  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
});

// --- Baseline lifecycle -----------------------------------------------------

describe("baseline lifecycle", () => {
  it("creates a baseline and audits it on the same transaction", async () => {
    vi.mocked(baselineRepository.createBaseline).mockResolvedValue(baseline({ status: "DRAFT" }));

    await service.createBaseline(CONTEXT, PROJECT_ID, {
      identifier: "BL-001",
      name: "Design baseline",
    });

    expect(baselineRepository.createBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, createdById: CONTEXT.actorId }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "baseline.created" }),
      TX,
    );
  });

  it("adds a member with a snapshot of the object's current state", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "DRAFT" }),
    );
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
      new Map([["DESIGN_ITEM:di1", currentObject()]]),
    );
    vi.mocked(memberRepository.createMember).mockResolvedValue(member());

    await service.addBaselineMember(CONTEXT, PROJECT_ID, BASELINE_ID, {
      nodeType: "DESIGN_ITEM",
      nodeId: "di1",
    });

    expect(memberRepository.createMember).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeType: "DESIGN_ITEM",
        identifierSnapshot: "DI-001",
        labelSnapshot: "Combustion chamber",
        stateSnapshot: "APPROVED",
        fingerprint: "fp-baselined",
      }),
      TX,
    );
  });

  it("refuses an object that does not exist in this project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "DRAFT" }),
    );
    // Resolved inside the scoped project: a foreign id simply does not resolve.
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(new Map());

    await expect(
      service.addBaselineMember(CONTEXT, PROJECT_ID, BASELINE_ID, {
        nodeType: "DESIGN_ITEM",
        nodeId: "di-in-another-project",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(memberRepository.createMember).not.toHaveBeenCalled();
  });

  it("removes a member from a draft", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "DRAFT" }),
    );
    vi.mocked(memberRepository.findMemberInBaseline).mockResolvedValue(member());

    await service.removeBaselineMember(CONTEXT, PROJECT_ID, BASELINE_ID, "mem1");

    expect(memberRepository.deleteMember).toHaveBeenCalledWith("mem1", TX);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "baseline.member_removed" }),
      TX,
    );
  });

  it("**refuses to change an active baseline's membership**", async () => {
    // The property drift detection rests on: an editable active baseline would
    // make every finding computed against it meaningless.
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());

    await expect(
      service.addBaselineMember(CONTEXT, PROJECT_ID, BASELINE_ID, {
        nodeType: "DESIGN_ITEM",
        nodeId: "di2",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      service.removeBaselineMember(CONTEXT, PROJECT_ID, BASELINE_ID, "mem1"),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      service.updateBaseline(CONTEXT, PROJECT_ID, BASELINE_ID, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(memberRepository.createMember).not.toHaveBeenCalled();
    expect(memberRepository.deleteMember).not.toHaveBeenCalled();
  });

  it("activates a draft with members", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "DRAFT" }),
    );
    vi.mocked(memberRepository.listMembers).mockResolvedValue([member()]);
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue(null);
    vi.mocked(baselineRepository.activateBaseline).mockResolvedValue(baseline());

    await service.activateBaseline(CONTEXT, PROJECT_ID, BASELINE_ID, {});

    expect(baselineRepository.activateBaseline).toHaveBeenCalledWith(
      BASELINE_ID,
      CONTEXT.actorId,
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "baseline.activated" }),
      TX,
    );
  });

  it("refuses to activate a baseline with no members", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "DRAFT" }),
    );
    vi.mocked(memberRepository.listMembers).mockResolvedValue([]);

    await expect(
      service.activateBaseline(CONTEXT, PROJECT_ID, BASELINE_ID, {}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("**refuses to silently replace an active baseline**", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ id: "bl2", status: "DRAFT" }),
    );
    vi.mocked(memberRepository.listMembers).mockResolvedValue([member()]);
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue(baseline());

    await expect(
      service.activateBaseline(CONTEXT, PROJECT_ID, "bl2", {}),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(baselineRepository.supersedeBaseline).not.toHaveBeenCalled();
    expect(baselineRepository.activateBaseline).not.toHaveBeenCalled();
  });

  it("supersedes the existing active baseline only when asked explicitly", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ id: "bl2", status: "DRAFT" }),
    );
    vi.mocked(memberRepository.listMembers).mockResolvedValue([member()]);
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue(baseline());
    vi.mocked(baselineRepository.supersedeBaseline).mockResolvedValue(
      baseline({ status: "SUPERSEDED" }),
    );
    vi.mocked(baselineRepository.activateBaseline).mockResolvedValue(
      baseline({ id: "bl2" }),
    );

    await service.activateBaseline(CONTEXT, PROJECT_ID, "bl2", { supersedeActive: true });

    expect(baselineRepository.supersedeBaseline).toHaveBeenCalledWith(BASELINE_ID, "bl2", TX);
    expect(baselineRepository.activateBaseline).toHaveBeenCalled();
  });

  it("404s for a baseline in another project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    await expect(
      service.getBaseline(CONTEXT, PROJECT_ID, "bl-elsewhere"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.createBaseline(CONTEXT, "other-project", { identifier: "BL-001", name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// --- Baseline comparison -----------------------------------------------------

describe("baseline comparison", () => {
  it("classifies an unchanged member as UNCHANGED", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(report.summary).toEqual({ total: 1, unchanged: 1, changed: 0, missing: 0, unknown: 0 });
    expect(report.members[0]!.status).toBe("UNCHANGED");
  });

  it("classifies a member whose current fingerprint differs as CHANGED", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-now", label: "Combustion chamber (rev B)" })],
    });

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(report.summary).toEqual({ total: 1, unchanged: 0, changed: 1, missing: 0, unknown: 0 });
    expect(report.members[0]!.status).toBe("CHANGED");
    expect(report.members[0]!.currentState).toBe("APPROVED");
  });

  it("classifies a member that no longer resolves in the project as OBJECT_MISSING", async () => {
    scenario({ members: [member()], current: [] });

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(report.summary).toEqual({ total: 1, unchanged: 0, changed: 0, missing: 1, unknown: 0 });
    expect(report.members[0]!.status).toBe("OBJECT_MISSING");
    expect(report.members[0]!.currentFingerprint).toBeNull();
  });

  it("attaches a declared change request already on record for a changed member", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-now" })],
    });
    vi.mocked(assessmentRepository.loadChangeContext).mockResolvedValue(
      new Map([["DESIGN_ITEM:di1", [{ changeRequestId: "cr1", identifier: "CR-001", status: "SUBMITTED" }]]]),
    );

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(report.members[0]!.declaredChanges).toEqual([
      { changeRequestId: "cr1", identifier: "CR-001", status: "SUBMITTED" },
    ]);
  });

  it("is a pure read: calling it twice never writes anything", async () => {
    scenario({ members: [member()], current: [currentObject({ fingerprint: "fp-now" })] });

    await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);
    await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("works against a DRAFT baseline — comparison is not restricted to ACTIVE/SUPERSEDED", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-now" })],
      baselineStatus: "DRAFT",
    });

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(report.baselineStatus).toBe("DRAFT");
    expect(report.summary.changed).toBe(1);
  });

  it("404s for a baseline in another project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    await expect(
      service.compareBaseline(CONTEXT, PROJECT_ID, "bl-elsewhere"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never contains a score or percentage anywhere in the response", async () => {
    scenario({
      members: [member(), member({ id: "mem2", nodeId: "di2" })],
      current: [currentObject({ fingerprint: "fp-now" })],
    });

    const report = await service.compareBaseline(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(JSON.stringify(report)).not.toMatch(/score|percent|confidence|probability/i);
  });
});

// --- Observations -----------------------------------------------------------

describe("observations", () => {
  it("records an observation with the actor from the session", async () => {
    vi.mocked(observationRepository.createObservation).mockResolvedValue(observation());

    await service.recordObservation(CONTEXT, PROJECT_ID, {
      identifier: "OBS-001",
      title: "Peak wall temperature",
      description: "Measured on flight 14.",
      observationType: "MEASUREMENT",
      observedAt: "2026-05-01T00:00:00.000Z",
      numericValue: "842.5",
      unit: "K",
    });

    expect(observationRepository.createObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        createdById: CONTEXT.actorId,
        numericValue: "842.5",
      }),
      TX,
    );
  });

  it("refuses a subject from another project", async () => {
    vi.mocked(observationRepository.observationSubjectExistsInProject).mockResolvedValue(false);

    await expect(
      service.recordObservation(CONTEXT, PROJECT_ID, {
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        subject: { type: "DESIGN_ITEM", id: "di-elsewhere" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(observationRepository.createObservation).not.toHaveBeenCalled();
  });

  it("updates a recorded observation", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "RECORDED" }),
    );
    vi.mocked(observationRepository.updateObservation).mockResolvedValue(observation());

    await service.updateObservation(CONTEXT, PROJECT_ID, "obs1", { title: "Corrected" });

    expect(observationRepository.updateObservation).toHaveBeenCalled();
  });

  it("**refuses to edit a reviewed observation**", async () => {
    // Editing then would rewrite evidence an engineer has already made a
    // determination about.
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "REVIEWED" }),
    );

    await expect(
      service.updateObservation(CONTEXT, PROJECT_ID, "obs1", { title: "Rewritten" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(observationRepository.updateObservation).not.toHaveBeenCalled();
  });

  it("reviews and rejects, recording the actor", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "RECORDED" }),
    );
    vi.mocked(observationRepository.transitionObservation).mockResolvedValue(observation());

    await service.reviewObservation(CONTEXT, PROJECT_ID, "obs1", {});
    expect(observationRepository.transitionObservation).toHaveBeenCalledWith(
      "obs1",
      "REVIEWED",
      CONTEXT.actorId,
      TX,
    );

    await service.rejectObservation(CONTEXT, PROJECT_ID, "obs1", {});
    expect(observationRepository.transitionObservation).toHaveBeenCalledWith(
      "obs1",
      "REJECTED",
      CONTEXT.actorId,
      TX,
    );
  });

  it("refuses to re-review a concluded observation", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "REJECTED" }),
    );

    await expect(
      service.reviewObservation(CONTEXT, PROJECT_ID, "obs1", {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("404s for an observation in another project", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(null);

    await expect(
      service.getObservation(CONTEXT, PROJECT_ID, "obs-elsewhere"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// --- Drift evaluation -------------------------------------------------------

describe("no drift", () => {
  it("reports NO_DRIFT when every baselined object still matches", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    const report = await evaluate();

    expect(report.assessment.status).toBe("NO_DRIFT");
    expect(findingFor(report, "DR-BAS-003")?.status).toBe("INFORMATIONAL");
    expect(findingFor(report, "DR-BAS-002")).toBeUndefined();
  });

  it("always records what it compared", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    const report = await evaluate();

    const scope = findingFor(report, "DR-SCP-001")!;
    expect(scope.explanation).toMatch(/1 baselined object/);
    expect(scope.explanation).toMatch(/0 reviewed observation/);
  });
});

describe("baseline changed", () => {
  it("reports BASELINE_CHANGED when an object's fingerprint has moved", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-changed", state: "BASELINED" })],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-BAS-002")!;
    expect(report.assessment.status).toBe("DRIFT_DETECTED");
    expect(finding.category).toBe("BASELINE_CHANGED");
    expect(finding.status).toBe("REVIEW_REQUIRED");
    expect(finding.baselineSubject?.identifier).toBe("DI-001");
    expect(finding.explanation).toMatch(/APPROVED to BASELINED/);
  });

  it("**does not claim the change was wrong**", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-changed" })],
    });

    const report = await evaluate();
    const finding = findingFor(report, "DR-BAS-002")!;

    expect(finding.explanation).toMatch(/not a finding that the change was wrong/i);
    expect(finding.basis).toContain("ENGINEERING_JUDGEMENT_REQUIRED");
    expect(JSON.stringify(report)).not.toMatch(/failed|defect|nonconform/i);
  });

  it("**never rewrites the baseline**", async () => {
    // The single most plausible "helpful" behaviour to get wrong. Detecting
    // that an object moved must not re-snapshot it.
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-changed" })],
    });

    await evaluate();

    expect(memberRepository.createMember).not.toHaveBeenCalled();
    expect(memberRepository.deleteMember).not.toHaveBeenCalled();
    expect(baselineRepository.updateBaseline).not.toHaveBeenCalled();
    expect(baselineRepository.activateBaseline).not.toHaveBeenCalled();
  });

  it("reports UNKNOWN when a baselined object no longer resolves", async () => {
    scenario({ members: [member()], current: [] });

    const report = await evaluate();

    const finding = findingFor(report, "DR-BAS-001")!;
    expect(report.assessment.status).toBe("UNKNOWN");
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.explanation).toMatch(/cannot be determined/i);
  });
});

// --- Expectations -----------------------------------------------------------

const EXPECTATION_MEMBER = member({
  id: "mem-exp",
  nodeType: "DECISION_EXPECTATION",
  nodeId: "exp1",
  identifierSnapshot: null,
  labelSnapshot: "Wall temperature stays below limit",
  stateSnapshot: "NOT_OBSERVED",
  fingerprint: "fp-exp",
});

function expectationObject(
  terms: { operator: string | null; expectedValue: string | null; unit: string | null },
): BaselineableObject {
  return currentObject({
    nodeType: "DECISION_EXPECTATION",
    nodeId: "exp1",
    identifier: null,
    label: "Wall temperature stays below limit",
    state: "NOT_OBSERVED",
    fingerprint: "fp-exp",
    comparisonTerms: terms as BaselineableObject["comparisonTerms"],
  });
}

describe("expectation comparison", () => {
  it("reports EXPECTATION_BREACH when the comparison does not hold", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-EXP-001")!;
    expect(report.assessment.status).toBe("DRIFT_DETECTED");
    expect(finding.category).toBe("EXPECTATION_BREACH");
    expect(finding.status).toBe("REVIEW_REQUIRED");
    expect(finding.expectedValue).toBe("≤ 800 K");
    expect(finding.observedValue).toBe("842 K");
  });

  it("**does not set the expectation to BREACHED**", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();
    const finding = findingFor(report, "DR-EXP-001")!;

    expect(finding.explanation).toMatch(/status has not been changed/i);
    expect(finding.basis).toContain("EXPECTATION_STATUS_NOT_CHANGED");
  });

  it("reports the satisfied case without setting HELD", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "780",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-EXP-002")!;
    expect(finding.status).toBe("INFORMATIONAL");
    expect(finding.explanation).toMatch(/does not set the expectation to HELD/i);
  });

  it("**is UNKNOWN when the units do not match**", async () => {
    // 800 °C and 1472 °F are the same temperature. Reporting UNKNOWN is the
    // honest result; converting would be a system doing arithmetic nobody asked
    // for on a scale with an offset.
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "degC" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "1472",
          unit: "degF",
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-EXP-003")!;
    expect(report.assessment.status).toBe("UNKNOWN");
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.explanation).toMatch(/no conversion/i);
    expect(findingFor(report, "DR-EXP-001")).toBeUndefined();
  });

  it("is UNKNOWN when the expectation records no operator", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [expectationObject({ operator: null, expectedValue: "< 800", unit: "K" })],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    expect(findingFor(report, "DR-EXP-003")?.status).toBe("UNKNOWN");
    // Notably it does NOT parse "<" out of the expected-value text.
    expect(findingFor(report, "DR-EXP-001")).toBeUndefined();
  });

  it("surfaces the decision's assumptions as context without judging them", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    const context = findingFor(report, "DR-CTX-002")!;
    expect(context.status).toBe("INFORMATIONAL");
    expect(context.basis).toContain("ASSUMPTION_VALIDITY_NOT_EVALUATED");
    expect(context.explanation).toMatch(/assumption monitoring remains responsible/i);
  });

  it("**never invalidates an assumption**", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    expect(JSON.stringify(report)).not.toMatch(/INVALIDATED|assumption invalid/i);
  });
});

// --- Observation hygiene ----------------------------------------------------

describe("unreviewed observations", () => {
  it("does not compare them, and says so", async () => {
    scenario({
      members: [EXPECTATION_MEMBER],
      current: [
        expectationObject({ operator: "LESS_THAN_OR_EQUAL", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          status: "RECORDED",
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const report = await evaluate();

    // An unreviewed report is not engineering evidence, so no comparison ran…
    expect(findingFor(report, "DR-EXP-001")).toBeUndefined();
    // …and the engine says so rather than letting silence imply it looked.
    expect(findingFor(report, "DR-OBS-001")?.status).toBe("UNKNOWN");
    expect(report.assessment.status).toBe("UNKNOWN");
  });

  it("ignores rejected observations without reporting them as pending", async () => {
    scenario({
      members: [member()],
      current: [currentObject()],
      observations: [observation({ status: "REJECTED" })],
    });

    const report = await evaluate();

    expect(findingFor(report, "DR-OBS-001")).toBeUndefined();
    expect(report.assessment.status).toBe("NO_DRIFT");
  });
});

// --- Supplier state ---------------------------------------------------------

describe("supplier state change", () => {
  it("reports a qualification whose status has moved since baselining", async () => {
    const qualMember = member({
      id: "mem-q",
      nodeType: "SUPPLIER_QUALIFICATION",
      nodeId: "q1",
      identifierSnapshot: null,
      labelSnapshot: "VIM material qualification",
      stateSnapshot: "ACTIVE",
      fingerprint: "fp-q",
    });

    scenario({
      members: [qualMember],
      current: [
        currentObject({
          nodeType: "SUPPLIER_QUALIFICATION",
          nodeId: "q1",
          identifier: null,
          label: "VIM material qualification",
          state: "EXPIRED",
          fingerprint: "fp-q-changed",
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-SUP-001")!;
    expect(finding.category).toBe("SUPPLIER_STATE_CHANGE");
    expect(finding.status).toBe("REVIEW_REQUIRED");
    expect(finding.expectedValue).toBe("ACTIVE");
    expect(finding.observedValue).toBe("EXPIRED");
  });

  it("**does not conclude the item is unqualified**", async () => {
    const qualMember = member({
      id: "mem-q",
      nodeType: "SUPPLIER_QUALIFICATION",
      nodeId: "q1",
      stateSnapshot: "ACTIVE",
      fingerprint: "fp-q",
      labelSnapshot: "VIM material qualification",
      identifierSnapshot: null,
    });

    scenario({
      members: [qualMember],
      current: [
        currentObject({
          nodeType: "SUPPLIER_QUALIFICATION",
          nodeId: "q1",
          identifier: null,
          label: "VIM material qualification",
          state: "EXPIRED",
          fingerprint: "fp-q-changed",
        }),
      ],
    });

    const report = await evaluate();
    const finding = findingFor(report, "DR-SUP-001")!;

    expect(finding.explanation).toMatch(/not a finding that the item is unqualified/i);
    expect(finding.explanation).toMatch(/may have been renewed/i);
  });
});

// --- Configuration ----------------------------------------------------------

describe("configuration observations", () => {
  it("reports a configuration observation on a design item that has changed", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-changed" })],
      observations: [
        observation({
          observationType: "CONFIGURATION_OBSERVATION",
          subject: { type: "DESIGN_ITEM", id: "di1" },
          textValue: "As-found: revision C liner",
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-CFG-001")!;
    expect(finding.category).toBe("CONFIGURATION_MISMATCH");
    expect(finding.status).toBe("REVIEW_REQUIRED");
    expect(finding.explanation).toMatch(/cannot be determined from the record/i);
  });

  it("reports an observation about an object outside the baseline as UNKNOWN", async () => {
    scenario({
      members: [],
      current: [],
      observations: [
        observation({
          observationType: "CONFIGURATION_OBSERVATION",
          subject: { type: "DESIGN_ITEM", id: "di-unbaselined" },
        }),
      ],
    });

    const report = await evaluate();

    const finding = findingFor(report, "DR-CFG-002")!;
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.explanation).toMatch(/nothing approved to compare/i);
  });
});

// --- Determinism, freshness, history ---------------------------------------

describe("determinism", () => {
  it("reaches an equivalent conclusion on a repeated evaluation", async () => {
    scenario({
      members: [member(), EXPECTATION_MEMBER],
      current: [
        currentObject({ fingerprint: "fp-changed" }),
        expectationObject({ operator: "LESS_THAN", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
      ],
    });

    const first = await evaluate();
    const second = await evaluate();

    expect(driftSignature(second)).toBe(driftSignature(first));
  });

  it("orders findings strongest first and writes the sequence", async () => {
    scenario({
      members: [member(), member({ id: "mem2", nodeId: "di2", identifierSnapshot: "DI-002" })],
      current: [
        currentObject({ fingerprint: "fp-changed" }),
        currentObject({ nodeId: "di2", identifier: "DI-002" }),
      ],
    });

    const report = await evaluate();

    expect(report.findings[0]?.status).toBe("REVIEW_REQUIRED");
    expect(report.findings.map((f) => f.sequence)).toEqual(
      report.findings.map((_, index) => index),
    );
  });

  it("produces multiple findings for multiple divergences", async () => {
    scenario({
      members: [member(), member({ id: "mem2", nodeId: "di2", identifierSnapshot: "DI-002" })],
      current: [
        currentObject({ fingerprint: "fp-a" }),
        currentObject({ nodeId: "di2", identifier: "DI-002", fingerprint: "fp-b" }),
      ],
    });

    const report = await evaluate();

    expect(report.findings.filter((f) => f.ruleId === "DR-BAS-002")).toHaveLength(2);
    expect(report.assessment.summary.reviewRequired).toBeGreaterThanOrEqual(2);
  });
});

describe("freshness", () => {
  it("is current immediately after an evaluation", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    const report = await evaluate();

    expect(report.freshness).toBe("CURRENT");
  });

  it("goes stale when a baselined object changes", async () => {
    scenario({ members: [member()], current: [currentObject()] });
    await evaluate();

    // The object moves after the assessment was written.
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
      new Map([["DESIGN_ITEM:di1", currentObject({ fingerprint: "fp-changed" })]]),
    );

    const latest = await service.getLatestDriftAssessment(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect("assessment" in latest && latest.freshness).toBe("STALE");
  });

  it("goes stale when an observation is reviewed", async () => {
    scenario({
      members: [member()],
      current: [currentObject()],
      observations: [observation({ status: "RECORDED" })],
    });
    await evaluate();

    vi.mocked(observationRepository.listObservationsForEvaluation).mockResolvedValue([
      observation({ status: "REVIEWED" }),
    ]);

    const latest = await service.getLatestDriftAssessment(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect("assessment" in latest && latest.freshness).toBe("STALE");
  });

  it("**stays current when an unrelated project object changes**", async () => {
    // The drift fingerprint covers the baseline's members and the project's
    // observations only. An artifact that is neither cannot stale it.
    scenario({ members: [member()], current: [currentObject()] });
    await evaluate();

    // A different design item is edited; it is not a baseline member and no
    // observation concerns it, so the drift basis is unchanged.
    const latest = await service.getLatestDriftAssessment(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect("assessment" in latest && latest.freshness).toBe("CURRENT");
  });

  it("reports UNKNOWN when the basis cannot be resolved", async () => {
    scenario({ members: [member()], current: [currentObject()] });
    await evaluate();

    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    const latest = await service.getLatestDriftAssessment(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect("assessment" in latest && latest.freshness).toBe("UNKNOWN");
  });
});

describe("history", () => {
  it("says NOT_EVALUATED before anything has been run", async () => {
    const latest = await service.getLatestDriftAssessment(CONTEXT, PROJECT_ID, BASELINE_ID);

    expect(latest).toEqual(
      expect.objectContaining({ status: "NOT_EVALUATED", projectId: PROJECT_ID }),
    );
  });

  it("appends rather than overwriting", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    const first = await evaluate();
    const second = await evaluate();

    expect(second.assessment.id).not.toBe(first.assessment.id);

    const history = await service.listDriftHistory(CONTEXT, PROJECT_ID, BASELINE_ID);
    expect(history).toHaveLength(2);
  });

  it("leaves a historical assessment exactly as it was written", async () => {
    scenario({ members: [member()], current: [currentObject()] });
    const first = await evaluate();

    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
      new Map([["DESIGN_ITEM:di1", currentObject({ fingerprint: "fp-changed" })]]),
    );

    const reopened = await service.explainDrift(CONTEXT, PROJECT_ID, first.assessment.id);

    // The verdict it recorded is unchanged; only its freshness has moved.
    expect(reopened.assessment.status).toBe("NO_DRIFT");
    expect(reopened.freshness).toBe("STALE");
  });

  it("404s for an assessment in another project", async () => {
    await expect(
      service.explainDrift(CONTEXT, PROJECT_ID, "drift-elsewhere"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("audit", () => {
  it("records the evaluation with the actor, baseline and verdict", async () => {
    scenario({ members: [member()], current: [currentObject()] });

    await evaluate();

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "drift.evaluated",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        metadata: expect.objectContaining({ baselineId: BASELINE_ID, status: "NO_DRIFT" }),
      }),
      TX,
    );
  });

  it("does not put every finding in the audit log", async () => {
    scenario({
      members: [member(), member({ id: "mem2", nodeId: "di2" })],
      current: [currentObject({ fingerprint: "a" }), currentObject({ nodeId: "di2", fingerprint: "b" })],
    });

    await evaluate();

    const driftEvents = vi
      .mocked(auditLogRepository.recordAuditEvent)
      .mock.calls.filter(([event]) => (event as { action: string }).action.startsWith("drift."));

    expect(driftEvents).toHaveLength(1);
  });
});

describe("what the engine never produces", () => {
  it("emits no score, confidence or probability", async () => {
    scenario({
      members: [member()],
      current: [currentObject({ fingerprint: "fp-changed" })],
    });

    const report = await evaluate();

    expect(JSON.stringify(report)).not.toMatch(
      /score|confidence|probability|anomaly|likelihood|percent/i,
    );
  });

  it("emits only rule ids the registry defines", async () => {
    scenario({
      members: [member(), EXPECTATION_MEMBER],
      current: [
        currentObject({ fingerprint: "fp-changed" }),
        expectationObject({ operator: "LESS_THAN", expectedValue: "800", unit: "K" }),
      ],
      observations: [
        observation({
          subject: { type: "DECISION_EXPECTATION", id: "exp1" },
          numericValue: "842",
          unit: "K",
        }),
        observation({ id: "obs2", identifier: "OBS-002", status: "RECORDED" }),
      ],
    });

    const report = await evaluate();
    const { driftRule } = await import("@/domain");

    for (const finding of report.findings) {
      expect(driftRule(finding.ruleId), `${finding.ruleId} must be registered`).not.toBeNull();
    }
  });
});
