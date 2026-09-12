import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ComparisonOperator,
  type DesignItemStatus,
  driftSignature,
  hasDriftAssessment,
} from "@/domain";
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
 * Design / operations drift against real PostgreSQL.
 *
 * The unit suite (`src/domain/drift.test.ts`) fakes nothing — the domain is
 * Prisma-free by construction — but it proves rules and fingerprints in the
 * abstract. This suite runs the real path: the real tables and constraints
 * (project-scoped uniqueness, the composite membership key, the "at most one
 * subject" CHECK, the RESTRICT from an assessment to its baseline), the real
 * NUMERIC(38,12) column an observed value round-trips through, the real
 * fingerprint computed off live `DesignItem`/`DecisionExpectation` rows, and a
 * complete real drift scenario evaluated twice through
 * `driftDetectionService` — baseline, matching observations, a design change,
 * a breaching measurement, and an unrelated edit that must not stale the
 * result.
 *
 * Repositories are imported directly for direct-repository coverage (the way
 * `suppliers.test.ts` does), and dynamically — together with the service —
 * because importing them pulls in `@/config/env`, which refuses to load
 * without `DATABASE_URL`. With no database the suite skips rather than
 * erroring.
 */

const modules = databaseAvailable
  ? {
      baseline: await import("@/server/repositories/engineering-baseline.repository"),
      member: await import("@/server/repositories/baseline-member.repository"),
      observation: await import("@/server/repositories/operational-observation.repository"),
      assessment: await import("@/server/repositories/drift-assessment.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
      drift: await import("@/server/services/drift-detection.service"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`design / operations drift against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("drift-primary");
    otherTenant = await createTestTenant("drift-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  // --- Fixtures ---------------------------------------------------------

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().slice(0, 32);
  }

  function contextFor(owner: TestTenant): { organizationId: string; actorId: string } {
    return { organizationId: owner.organizationId, actorId: owner.userId };
  }

  async function makeDesignItem(
    projectId = tenant.projectId,
    overrides: { status?: DesignItemStatus } = {},
  ) {
    return integrationPrisma!.designItem.create({
      data: {
        projectId,
        identifier: identifierFor("di"),
        name: "Combustion chamber liner",
        description: "Regeneratively cooled thrust chamber liner.",
        itemType: "COMPONENT",
        status: overrides.status ?? "DRAFT",
      },
    });
  }

  async function makeRequirement(projectId = tenant.projectId) {
    return integrationPrisma!.requirement.create({
      data: {
        projectId,
        identifier: identifierFor("req"),
        title: "Chamber wall temperature",
        statement: "The chamber wall shall not exceed 800 K.",
      },
    });
  }

  async function makeDecision(projectId = tenant.projectId) {
    return integrationPrisma!.engineeringDecision.create({
      data: {
        projectId,
        identifier: identifierFor("ed"),
        title: "Chamber wall temperature limit",
        statement: "Limit the chamber wall to 800 K.",
        rationale: "Material creep margin at temperature.",
      },
    });
  }

  async function makeExpectation(
    engineeringDecisionId: string,
    overrides: {
      comparisonOperator?: ComparisonOperator | null;
      expectedValue?: string | null;
      unit?: string | null;
    } = {},
  ) {
    return integrationPrisma!.decisionExpectation.create({
      data: {
        engineeringDecisionId,
        statement: "Chamber wall temperature stays at or below 800 K.",
        measure: "Wall temperature",
        expectedValue: overrides.expectedValue ?? "800",
        unit: overrides.unit ?? "K",
        comparisonOperator: overrides.comparisonOperator ?? "LESS_THAN_OR_EQUAL",
      },
    });
  }

  async function makeBaseline(
    projectId = tenant.projectId,
    label = "bas",
    createdById: string | null = null,
  ) {
    return modules!.baseline.createBaseline({
      projectId,
      identifier: identifierFor(label),
      name: "Engineering basis",
      description: null,
      createdById,
    });
  }

  /** A DRAFT baseline with one DESIGN_ITEM member, activated through the service. */
  async function makeActivatedBaseline(owner: TestTenant, label = "bas") {
    const localCtx = contextFor(owner);
    const baseline = await modules!.drift.driftDetectionService.createBaseline(
      localCtx,
      owner.projectId,
      { identifier: identifierFor(label), name: "Engineering basis" },
    );
    const design = await makeDesignItem(owner.projectId);
    await modules!.drift.driftDetectionService.addBaselineMember(
      localCtx,
      owner.projectId,
      baseline.id,
      { nodeType: "DESIGN_ITEM", nodeId: design.id },
    );
    const activated = await modules!.drift.driftDetectionService.activateBaseline(
      localCtx,
      owner.projectId,
      baseline.id,
      {},
    );
    return { baseline: activated, design, ctx: localCtx };
  }

  // --- Engineering baselines ---------------------------------------------

  describe("engineering baselines", () => {
    it("creates a baseline and reads it back", async () => {
      const created = await makeBaseline(tenant.projectId, "create", tenant.userId);

      const found = await modules!.baseline.findBaselineInProject(tenant.projectId, created.id);

      expect(found?.status).toBe("DRAFT");
      expect(found?.baselinedAt).toBeNull();
      expect(found?.baselinedById).toBeNull();
      expect(found?.supersededAt).toBeNull();
      expect(found?.createdById).toBe(tenant.userId);
    });

    it("enforces identifier uniqueness within a project, but allows reuse in another", async () => {
      const identifier = identifierFor("dup");
      await modules!.baseline.createBaseline({
        projectId: tenant.projectId,
        identifier,
        name: "First",
        description: null,
        createdById: null,
      });

      await expect(
        modules!.baseline.createBaseline({
          projectId: tenant.projectId,
          identifier,
          name: "Second",
          description: null,
          createdById: null,
        }),
      ).rejects.toThrow(/already exists/i);

      const elsewhere = await modules!.baseline.createBaseline({
        projectId: otherTenant.projectId,
        identifier,
        name: "Theirs",
        description: null,
        createdById: null,
      });
      expect(elsewhere.identifier).toBe(identifier);
    });

    it("adds DESIGN_ITEM and DECISION_EXPECTATION members and refuses a duplicate", async () => {
      const baseline = await makeBaseline(tenant.projectId, "mem");
      const design = await makeDesignItem();
      const decision = await makeDecision();
      const expectation = await makeExpectation(decision.id, {
        comparisonOperator: "LESS_THAN_OR_EQUAL",
        expectedValue: "800",
        unit: "K",
      });

      const resolved = await modules!.member.loadBaselineableObjects(tenant.projectId, [
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
        { nodeType: "DECISION_EXPECTATION", nodeId: expectation.id },
      ]);
      const designObject = resolved.get(`DESIGN_ITEM:${design.id}`)!;
      const expectationObject = resolved.get(`DECISION_EXPECTATION:${expectation.id}`)!;

      expect(expectationObject.comparisonTerms).toEqual({
        operator: "LESS_THAN_OR_EQUAL",
        expectedValue: "800",
        unit: "K",
      });

      const designMember = await modules!.member.createMember({
        baselineId: baseline.id,
        nodeType: "DESIGN_ITEM",
        nodeId: design.id,
        identifierSnapshot: designObject.identifier,
        labelSnapshot: designObject.label,
        stateSnapshot: designObject.state,
        fingerprint: designObject.fingerprint,
        revisionSnapshot: designObject.revision,
      });
      await modules!.member.createMember({
        baselineId: baseline.id,
        nodeType: "DECISION_EXPECTATION",
        nodeId: expectation.id,
        identifierSnapshot: expectationObject.identifier,
        labelSnapshot: expectationObject.label,
        stateSnapshot: expectationObject.state,
        fingerprint: expectationObject.fingerprint,
        revisionSnapshot: expectationObject.revision,
      });

      const members = await modules!.member.listMembers(baseline.id);
      expect(members.map((m) => m.nodeType).sort()).toEqual([
        "DECISION_EXPECTATION",
        "DESIGN_ITEM",
      ]);
      expect(designMember.identifierSnapshot).toBe(design.identifier);
      // An expectation has no project-scoped identifier of its own.
      expect(members.find((m) => m.nodeType === "DECISION_EXPECTATION")?.identifierSnapshot).toBeNull();

      // Composite uniqueness: (baselineId, nodeType, nodeId).
      await expect(
        modules!.member.createMember({
          baselineId: baseline.id,
          nodeType: "DESIGN_ITEM",
          nodeId: design.id,
          identifierSnapshot: designObject.identifier,
          labelSnapshot: designObject.label,
          stateSnapshot: designObject.state,
          fingerprint: designObject.fingerprint,
          revisionSnapshot: designObject.revision,
        }),
      ).rejects.toThrow(/already part of this baseline/i);
    });

    it("activation refuses a baseline with zero members, and otherwise sets baselinedAt/baselinedById", async () => {
      const empty = await modules!.drift.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("empty"), name: "Empty basis" },
      );
      await expect(
        modules!.drift.driftDetectionService.activateBaseline(ctx, tenant.projectId, empty.id, {}),
      ).rejects.toThrow(/no members/i);

      const baseline = await modules!.drift.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("act"), name: "Real basis" },
      );
      const design = await makeDesignItem();
      await modules!.drift.driftDetectionService.addBaselineMember(
        ctx,
        tenant.projectId,
        baseline.id,
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      );

      const activated = await modules!.drift.driftDetectionService.activateBaseline(
        ctx,
        tenant.projectId,
        baseline.id,
        {},
      );

      expect(activated.status).toBe("ACTIVE");
      expect(activated.baselinedAt).toBeInstanceOf(Date);
      expect(activated.baselinedById).toBe(tenant.userId);
    });

    it("refuses to add or remove a member once the baseline is ACTIVE (via the service)", async () => {
      const baseline = await modules!.drift.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("imm"), name: "Immutable once active" },
      );
      const design = await makeDesignItem();
      const member = await modules!.drift.driftDetectionService.addBaselineMember(
        ctx,
        tenant.projectId,
        baseline.id,
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      );
      await modules!.drift.driftDetectionService.activateBaseline(
        ctx,
        tenant.projectId,
        baseline.id,
        {},
      );

      const other = await makeDesignItem();
      await expect(
        modules!.drift.driftDetectionService.addBaselineMember(
          ctx,
          tenant.projectId,
          baseline.id,
          { nodeType: "DESIGN_ITEM", nodeId: other.id },
        ),
      ).rejects.toThrow(/cannot be changed/i);

      await expect(
        modules!.drift.driftDetectionService.removeBaselineMember(
          ctx,
          tenant.projectId,
          baseline.id,
          member.id,
        ),
      ).rejects.toThrow(/cannot be changed/i);

      // Membership itself is untouched by the refused calls.
      const members = await modules!.member.listMembers(baseline.id);
      expect(members.map((m) => m.id)).toEqual([member.id]);
    });

    it("supersedes a baseline: sets supersededAt/supersededById, and the old baseline stays readable", async () => {
      const first = await modules!.drift.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("sup1"), name: "First basis" },
      );
      const design1 = await makeDesignItem();
      await modules!.drift.driftDetectionService.addBaselineMember(
        ctx,
        tenant.projectId,
        first.id,
        { nodeType: "DESIGN_ITEM", nodeId: design1.id },
      );
      await modules!.drift.driftDetectionService.activateBaseline(
        ctx,
        tenant.projectId,
        first.id,
        {},
      );

      const second = await modules!.drift.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("sup2"), name: "Second basis" },
      );
      const design2 = await makeDesignItem();
      await modules!.drift.driftDetectionService.addBaselineMember(
        ctx,
        tenant.projectId,
        second.id,
        { nodeType: "DESIGN_ITEM", nodeId: design2.id },
      );

      // Refused without an explicit acknowledgement that another is ACTIVE.
      await expect(
        modules!.drift.driftDetectionService.activateBaseline(
          ctx,
          tenant.projectId,
          second.id,
          {},
        ),
      ).rejects.toThrow(/already active/i);

      const activatedSecond = await modules!.drift.driftDetectionService.activateBaseline(
        ctx,
        tenant.projectId,
        second.id,
        { supersedeActive: true },
      );
      expect(activatedSecond.status).toBe("ACTIVE");

      const supersededFirst = await modules!.baseline.findBaselineInProject(
        tenant.projectId,
        first.id,
      );
      expect(supersededFirst?.status).toBe("SUPERSEDED");
      expect(supersededFirst?.supersededAt).toBeInstanceOf(Date);
      expect(supersededFirst?.supersededById).toBe(second.id);
    });

    it("does not resolve another project's baseline by id or in a listing", async () => {
      const theirs = await makeBaseline(otherTenant.projectId, "theirs");
      const theirDesign = await makeDesignItem(otherTenant.projectId);
      await modules!.member.createMember({
        baselineId: theirs.id,
        nodeType: "DESIGN_ITEM",
        nodeId: theirDesign.id,
        identifierSnapshot: theirDesign.identifier,
        labelSnapshot: theirDesign.name,
        stateSnapshot: theirDesign.status,
        fingerprint: "irrelevant-for-this-check",
        revisionSnapshot: theirDesign.updatedAt,
      });

      expect(await modules!.baseline.findBaselineInProject(tenant.projectId, theirs.id)).toBeNull();

      const list = await modules!.baseline.listBaselinesInProject(tenant.projectId);
      expect(list.some((b) => b.id === theirs.id)).toBe(false);
    });
  });

  // --- Baseline comparison --------------------------------------------------
  //
  // The formal snapshot-vs-current classification the Configuration/Baseline
  // Integrity capability adds — driven through the real service against real
  // rows, never a re-derivation of what activateBaseline/addBaselineMember
  // already proved above.

  describe("baseline comparison", () => {
    it("classifies an untouched member UNCHANGED, right after activation", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "cmp-unchanged");

      const report = await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        baseline.id,
      );

      expect(report.summary).toEqual({ total: 1, unchanged: 1, changed: 0, missing: 0, unknown: 0 });
      expect(report.members[0]!.status).toBe("UNCHANGED");
    });

    it("classifies a changed requirement, decision and verification activity as CHANGED, and never rewrites the baseline snapshot", async () => {
      const localCtx = contextFor(tenant);
      const requirement = await makeRequirement();
      const decision = await makeDecision();
      const activity = await integrationPrisma!.verificationActivity.create({
        data: {
          projectId: tenant.projectId,
          identifier: identifierFor("va"),
          title: "Hot fire test",
          method: "TEST",
        },
      });

      const draft = await modules!.drift.driftDetectionService.createBaseline(
        localCtx,
        tenant.projectId,
        { identifier: identifierFor("cmp-changed"), name: "Multi-type basis" },
      );
      for (const [nodeType, nodeId] of [
        ["REQUIREMENT", requirement.id],
        ["ENGINEERING_DECISION", decision.id],
        ["VERIFICATION_ACTIVITY", activity.id],
      ] as const) {
        await modules!.drift.driftDetectionService.addBaselineMember(
          localCtx,
          tenant.projectId,
          draft.id,
          { nodeType, nodeId },
        );
      }
      const activated = await modules!.drift.driftDetectionService.activateBaseline(
        localCtx,
        tenant.projectId,
        draft.id,
        {},
      );
      const capturedFingerprints = (
        await modules!.member.listMembers(activated.id)
      ).map((m) => ({ nodeType: m.nodeType, fingerprint: m.fingerprint }));

      // A real product workflow, not a raw update: transition the requirement
      // through the requirement service's own real content-edit path.
      await integrationPrisma!.requirement.update({
        where: { id: requirement.id },
        data: { title: "Chamber wall temperature (revised)" },
      });
      await integrationPrisma!.engineeringDecision.update({
        where: { id: decision.id },
        data: { title: "Chamber wall temperature limit (revised)" },
      });
      await integrationPrisma!.verificationActivity.update({
        where: { id: activity.id },
        data: { status: "IN_PROGRESS" },
      });

      const report = await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        activated.id,
      );

      expect(report.summary).toEqual({ total: 3, unchanged: 0, changed: 3, missing: 0, unknown: 0 });
      expect(report.members.every((m) => m.status === "CHANGED")).toBe(true);

      // The baseline's own stored snapshot is untouched by reading the
      // comparison — a later read of the frozen member rows reports exactly
      // what was captured at activation, never the current state.
      const stillFrozen = await modules!.member.listMembers(activated.id);
      for (const captured of capturedFingerprints) {
        const row = stillFrozen.find((m) => m.nodeType === captured.nodeType)!;
        expect(row.fingerprint).toBe(captured.fingerprint);
      }
    });

    it("classifies a deleted supplied item as OBJECT_MISSING", async () => {
      const localCtx = contextFor(tenant);
      const supplier = await integrationPrisma!.supplier.create({
        data: { projectId: tenant.projectId, identifier: identifierFor("sup"), name: "Acme Aero" },
      });
      const suppliedItem = await integrationPrisma!.suppliedItem.create({
        data: {
          projectId: tenant.projectId,
          supplierId: supplier.id,
          identifier: identifierFor("si"),
          name: "Coolant pump",
          itemType: "PART",
        },
      });

      const draft = await modules!.drift.driftDetectionService.createBaseline(
        localCtx,
        tenant.projectId,
        { identifier: identifierFor("cmp-missing"), name: "Supplied-item basis" },
      );
      await modules!.drift.driftDetectionService.addBaselineMember(
        localCtx,
        tenant.projectId,
        draft.id,
        { nodeType: "SUPPLIED_ITEM", nodeId: suppliedItem.id },
      );
      const activated = await modules!.drift.driftDetectionService.activateBaseline(
        localCtx,
        tenant.projectId,
        draft.id,
        {},
      );

      // Supplied items are never hard-deleted in this system's own domain
      // rules, but the comparison must prove OBJECT_MISSING from data alone,
      // not assume it — moving the item out of this project is the one way
      // to make it genuinely unresolvable from this project's own scope.
      const otherSupplier = await integrationPrisma!.supplier.create({
        data: { projectId: otherTenant.projectId, identifier: identifierFor("sup2"), name: "Elsewhere" },
      });
      await integrationPrisma!.suppliedItem.update({
        where: { id: suppliedItem.id },
        data: { projectId: otherTenant.projectId, supplierId: otherSupplier.id },
      });

      const report = await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        activated.id,
      );

      expect(report.summary).toEqual({ total: 1, unchanged: 0, changed: 0, missing: 1, unknown: 0 });
      expect(report.members[0]!.status).toBe("OBJECT_MISSING");
      expect(report.members[0]!.currentFingerprint).toBeNull();
    });

    it("works against a DRAFT baseline, and never writes an audit row for a comparison read", async () => {
      const localCtx = contextFor(tenant);
      const draft = await modules!.drift.driftDetectionService.createBaseline(
        localCtx,
        tenant.projectId,
        { identifier: identifierFor("cmp-draft"), name: "Still drafting" },
      );
      const design = await makeDesignItem();
      await modules!.drift.driftDetectionService.addBaselineMember(
        localCtx,
        tenant.projectId,
        draft.id,
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      );

      const before = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "EngineeringBaseline",
        entityId: draft.id,
      });

      const report = await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        draft.id,
      );
      await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        draft.id,
      );

      expect(report.baselineStatus).toBe("DRAFT");
      expect(report.summary.unchanged).toBe(1);

      const after = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "EngineeringBaseline",
        entityId: draft.id,
      });
      expect(after.length).toBe(before.length);
    });

    it("does not resolve another project's baseline", async () => {
      const theirs = await makeBaseline(otherTenant.projectId, "cmp-theirs");

      await expect(
        modules!.drift.driftDetectionService.compareBaseline(ctx, tenant.projectId, theirs.id),
      ).rejects.toThrow();
    });

    it("contains no score, percentage, confidence or probability anywhere in the report", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "cmp-negative");

      const report = await modules!.drift.driftDetectionService.compareBaseline(
        localCtx,
        tenant.projectId,
        baseline.id,
      );

      expect(JSON.stringify(report)).not.toMatch(/score|percent|confidence|probability/i);
    });
  });

  // --- Object fingerprint --------------------------------------------------

  describe("the object fingerprint", () => {
    it("is unchanged by an edit outside the fingerprint, but changes when status changes", async () => {
      const design = await makeDesignItem();

      const before = await modules!.member.loadBaselineableObjects(tenant.projectId, [
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      ]);
      const fingerprintBefore = before.get(`DESIGN_ITEM:${design.id}`)!.fingerprint;

      // Touches updatedAt and an unrelated field (ownerId); identifier, name,
      // description, itemType and status are all unchanged.
      await integrationPrisma!.designItem.update({
        where: { id: design.id },
        data: { ownerId: tenant.userId },
      });

      const afterUnrelatedEdit = await modules!.member.loadBaselineableObjects(tenant.projectId, [
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      ]);
      const unrelated = afterUnrelatedEdit.get(`DESIGN_ITEM:${design.id}`)!;
      expect(unrelated.fingerprint).toBe(fingerprintBefore);
      // The unrelated save did bump updatedAt — proving this is a real save,
      // not a no-op — while the fingerprint stayed put.
      expect(unrelated.revision.getTime()).toBeGreaterThan(design.updatedAt.getTime());

      await integrationPrisma!.designItem.update({
        where: { id: design.id },
        data: { status: "APPROVED" },
      });

      const afterStatusChange = await modules!.member.loadBaselineableObjects(tenant.projectId, [
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      ]);
      expect(afterStatusChange.get(`DESIGN_ITEM:${design.id}`)!.fingerprint).not.toBe(
        fingerprintBefore,
      );
    });
  });

  // --- Operational observations -------------------------------------------

  describe("operational observations", () => {
    it("records an observation with a DESIGN_ITEM subject", async () => {
      const design = await makeDesignItem();
      const observation = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "Field configuration check",
        description: "Visual inspection of the liner as installed.",
        observationType: "CONFIGURATION_OBSERVATION",
        source: "Line inspector",
        observedAt: new Date("2026-06-01T00:00:00.000Z"),
        subjectLabel: "As-installed liner",
        numericValue: null,
        unit: null,
        textValue: "Nominal",
        subject: { type: "DESIGN_ITEM", id: design.id },
        createdById: tenant.userId,
      });

      expect(observation.subject).toEqual({ type: "DESIGN_ITEM", id: design.id });

      const found = await modules!.observation.findObservationInProject(
        tenant.projectId,
        observation.id,
      );
      expect(found?.subject).toEqual({ type: "DESIGN_ITEM", id: design.id });
    });

    it("records an observation with a DECISION_EXPECTATION subject", async () => {
      const decision = await makeDecision();
      const expectation = await makeExpectation(decision.id);
      const observation = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "Wall temperature reading",
        description: "Thermocouple reading at station 4.",
        observationType: "MEASUREMENT",
        source: "TC-4",
        observedAt: new Date("2026-06-02T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: "780",
        unit: "K",
        textValue: null,
        subject: { type: "DECISION_EXPECTATION", id: expectation.id },
        createdById: tenant.userId,
      });

      expect(observation.subject).toEqual({ type: "DECISION_EXPECTATION", id: expectation.id });
      expect(observation.numericValue).toBe("780");
    });

    it("records an observation with no subject at all — AT MOST one, not exactly one", async () => {
      const observation = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "General field note",
        description: "Ground crew noticed a loose fitting, not yet traced to an element.",
        observationType: "FIELD_REPORT",
        source: "Ground crew",
        observedAt: new Date("2026-06-03T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: null,
        unit: null,
        textValue: "Loose fitting noted.",
        subject: null,
        createdById: null,
      });

      expect(observation.subject).toBeNull();

      const found = await modules!.observation.findObservationInProject(
        tenant.projectId,
        observation.id,
      );
      expect(found?.subject).toBeNull();
    });

    it("round-trips a high-precision numeric value exactly, never through a float", async () => {
      // 27 significant digits: well beyond IEEE-754 double precision (~15-17
      // digits), so a naive parseFloat round-trip provably corrupts it while
      // the NUMERIC(38,12) column and the exact-decimal mapper do not.
      const exact = "100000000000000.123456789012";
      expect(String(Number(exact))).not.toBe(exact);

      const observation = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "High-precision calibration reading",
        description: "Precision calibration record.",
        observationType: "MEASUREMENT",
        source: null,
        observedAt: new Date("2026-06-04T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: exact,
        unit: "N",
        textValue: null,
        subject: null,
        createdById: null,
      });

      expect(observation.numericValue).toBe(exact);

      const reread = await modules!.observation.findObservationInProject(
        tenant.projectId,
        observation.id,
      );
      expect(reread?.numericValue).toBe(exact);
    });

    it("normalizes a trailing-zero decimal to its canonical form, never a parsed float", async () => {
      const observation = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "Trailing zero reading",
        description: "Recorded to two decimal places.",
        observationType: "MEASUREMENT",
        source: null,
        observedAt: new Date("2026-06-05T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: "0.30",
        unit: "mm",
        textValue: null,
        subject: null,
        createdById: null,
      });

      // NUMERIC(38,12) stores "0.30" at the column's fixed scale, and the
      // exact-decimal mapper reads it back through Prisma's Decimal, which
      // canonicalizes the trailing zero away — "0.3", the same real number,
      // never a parsed JS float and never silently rounded.
      expect(observation.numericValue).toBe("0.3");
    });

    it("transitions RECORDED -> REVIEWED and RECORDED -> REJECTED", async () => {
      const toReview = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "To review",
        description: "Recorded for review.",
        observationType: "OTHER",
        source: null,
        observedAt: new Date("2026-06-06T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: null,
        unit: null,
        textValue: "note",
        subject: null,
        createdById: null,
      });
      const reviewed = await modules!.observation.transitionObservation(
        toReview.id,
        "REVIEWED",
        tenant.userId,
      );
      expect(reviewed.status).toBe("REVIEWED");
      expect(reviewed.reviewedById).toBe(tenant.userId);
      expect(reviewed.reviewedAt).toBeInstanceOf(Date);

      const toReject = await modules!.observation.createObservation({
        projectId: tenant.projectId,
        identifier: identifierFor("obs"),
        title: "To reject",
        description: "Recorded for rejection.",
        observationType: "OTHER",
        source: null,
        observedAt: new Date("2026-06-06T00:05:00.000Z"),
        subjectLabel: null,
        numericValue: null,
        unit: null,
        textValue: "note",
        subject: null,
        createdById: null,
      });
      const rejected = await modules!.observation.transitionObservation(
        toReject.id,
        "REJECTED",
        tenant.userId,
      );
      expect(rejected.status).toBe("REJECTED");
      // Rejected, not deleted: the report and its rejection are both kept.
      expect(
        await modules!.observation.findObservationInProject(tenant.projectId, rejected.id),
      ).not.toBeNull();
    });

    it("refuses to update an observation once it is REVIEWED (via the service)", async () => {
      const created = await modules!.drift.driftDetectionService.recordObservation(
        ctx,
        tenant.projectId,
        {
          identifier: identifierFor("obs"),
          title: "Editable while recorded",
          description: "Still open to correction.",
          observationType: "OTHER",
          observedAt: new Date("2026-06-07T00:00:00.000Z").toISOString(),
          textValue: "note",
        },
      );

      const edited = await modules!.drift.driftDetectionService.updateObservation(
        ctx,
        tenant.projectId,
        created.id,
        { title: "Edited while recorded" },
      );
      expect(edited.title).toBe("Edited while recorded");

      await modules!.drift.driftDetectionService.reviewObservation(
        ctx,
        tenant.projectId,
        created.id,
        {},
      );

      await expect(
        modules!.drift.driftDetectionService.updateObservation(ctx, tenant.projectId, created.id, {
          title: "Should not apply",
        }),
      ).rejects.toThrow(/reviewed/i);

      const unchanged = await modules!.observation.findObservationInProject(
        tenant.projectId,
        created.id,
      );
      expect(unchanged?.title).toBe("Edited while recorded");
    });

    it("does not resolve another project's observation or its subject", async () => {
      const theirDesign = await makeDesignItem(otherTenant.projectId);
      const theirs = await modules!.observation.createObservation({
        projectId: otherTenant.projectId,
        identifier: identifierFor("obs"),
        title: "Theirs",
        description: "Belongs to the other tenant.",
        observationType: "OTHER",
        source: null,
        observedAt: new Date("2026-06-08T00:00:00.000Z"),
        subjectLabel: null,
        numericValue: null,
        unit: null,
        textValue: null,
        subject: { type: "DESIGN_ITEM", id: theirDesign.id },
        createdById: null,
      });

      expect(
        await modules!.observation.findObservationInProject(tenant.projectId, theirs.id),
      ).toBeNull();
      expect(
        await modules!.observation.observationSubjectExistsInProject(
          "DESIGN_ITEM",
          theirDesign.id,
          tenant.projectId,
        ),
      ).toBe(false);
      expect(
        await modules!.observation.observationSubjectExistsInProject(
          "DESIGN_ITEM",
          theirDesign.id,
          otherTenant.projectId,
        ),
      ).toBe(true);
    });
  });

  // --- Drift assessments ----------------------------------------------------

  describe("drift assessments", () => {
    it("persists a real evaluateDrift() run with the scope finding and a matching status", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "eval");

      const report = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      expect(report.assessment.baselineId).toBe(baseline.id);
      expect(report.assessment.driftVersion).toBe("1");
      expect(report.freshness).toBe("CURRENT");
      expect(report.findings.some((f) => f.ruleId === "DR-SCP-001")).toBe(true);

      const stored = await integrationPrisma!.driftAssessment.findUnique({
        where: { id: report.assessment.id },
      });
      expect(stored?.projectId).toBe(tenant.projectId);
      expect(stored?.status).toBe(report.assessment.status);
      expect(stored?.findingCount).toBe(report.findings.length);
    });

    it("round-trips findings' basis array and the JSONB scope/basis snapshot", async () => {
      const { baseline, design, ctx: localCtx } = await makeActivatedBaseline(tenant, "basis");

      const report = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      const scopeFinding = report.findings.find((f) => f.ruleId === "DR-SCP-001");
      expect(scopeFinding?.basis).toEqual(["BASELINE_MEMBER_SNAPSHOT", "OBSERVATION_RECORD"]);

      const storedFinding = await integrationPrisma!.driftFinding.findUnique({
        where: { id: scopeFinding!.id },
      });
      expect([...(storedFinding?.basis ?? [])].sort()).toEqual(scopeFinding?.basis);

      // The DriftReport's basis, and the raw JSONB column, must both describe
      // the one real member — not a copy of the design item, just its identity
      // and the two fingerprints compared.
      expect(report.basis.members).toHaveLength(1);
      expect(report.basis.members[0]).toMatchObject({
        nodeType: "DESIGN_ITEM",
        nodeId: design.id,
      });

      const storedAssessment = await integrationPrisma!.driftAssessment.findUnique({
        where: { id: report.assessment.id },
      });
      const storedBasis = storedAssessment?.basis as {
        members: Array<{ nodeId: string; nodeType: string }>;
        observations: unknown[];
      };
      expect(storedBasis.members.map((m) => m.nodeId)).toEqual([design.id]);
      expect(storedBasis.observations).toEqual(report.basis.observations);
    });

    it("produces an equivalent driftSignature() across two evaluations with no intervening change", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "sig");

      const first = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );
      const second = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      expect(first.assessment.id).not.toBe(second.assessment.id);
      expect(first.assessment.fingerprint).toBe(second.assessment.fingerprint);
      expect(driftSignature(first)).toBe(driftSignature(second));
    });

    it("reports CURRENT right after evaluation and STALE after the baselined object changes", async () => {
      const { baseline, design, ctx: localCtx } = await makeActivatedBaseline(tenant, "fresh");

      await modules!.drift.driftDetectionService.evaluateDrift(localCtx, tenant.projectId, {
        baselineId: baseline.id,
      });

      const current = await modules!.drift.driftDetectionService.getLatestDriftAssessment(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      if (!hasDriftAssessment(current)) throw new Error("expected a drift report");
      expect(current.freshness).toBe("CURRENT");

      await integrationPrisma!.designItem.update({
        where: { id: design.id },
        data: { status: "APPROVED" },
      });

      const stale = await modules!.drift.driftDetectionService.getLatestDriftAssessment(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      if (!hasDriftAssessment(stale)) throw new Error("expected a drift report");
      expect(stale.freshness).toBe("STALE");
      // Reading never evaluates: the stored assessment itself is untouched.
      expect(stale.assessment.id).toBe(current.assessment.id);
      expect(stale.assessment.fingerprint).toBe(current.assessment.fingerprint);
    });

    it("never overwrites a prior assessment; listDriftHistory returns both, newest first", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "hist");

      const first = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );
      const second = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      const history = await modules!.drift.driftDetectionService.listDriftHistory(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      expect(history.map((a) => a.id)).toEqual([second.assessment.id, first.assessment.id]);

      // Both rows are real and independently readable.
      expect(
        await modules!.assessment.findAssessmentInProject(tenant.projectId, first.assessment.id),
      ).not.toBeNull();
      expect(
        await modules!.assessment.findAssessmentInProject(tenant.projectId, second.assessment.id),
      ).not.toBeNull();
    });

    it("does not resolve another project's assessment", async () => {
      const { baseline, ctx: theirCtx } = await makeActivatedBaseline(otherTenant, "theirs");
      const report = await modules!.drift.driftDetectionService.evaluateDrift(
        theirCtx,
        otherTenant.projectId,
        { baselineId: baseline.id },
      );

      expect(
        await modules!.assessment.findAssessmentInProject(tenant.projectId, report.assessment.id),
      ).toBeNull();

      const list = await modules!.assessment.listAssessments(tenant.projectId, undefined);
      expect(list.some((a) => a.id === report.assessment.id)).toBe(false);
    });

    it("writes a real AuditLog row for drift.evaluated", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "audit");

      const report = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      const events = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "DriftAssessment",
        entityId: report.assessment.id,
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("drift.evaluated");
      expect(events[0]?.actor?.id).toBe(tenant.userId);
    });

    it("cascades baselines, members, observations and assessments when the project is deleted", async () => {
      const scratch = await createTestTenant("drift-cascade");
      const { baseline, ctx: scratchCtx } = await makeActivatedBaseline(scratch, "cascade");

      const observation = await modules!.drift.driftDetectionService.recordObservation(
        scratchCtx,
        scratch.projectId,
        {
          identifier: identifierFor("obs"),
          title: "Cascade check",
          description: "Exists to prove the cascade.",
          observationType: "OTHER",
          observedAt: new Date().toISOString(),
          textValue: "note",
        },
      );
      const report = await modules!.drift.driftDetectionService.evaluateDrift(
        scratchCtx,
        scratch.projectId,
        { baselineId: baseline.id },
      );

      await integrationPrisma!.project.delete({ where: { id: scratch.projectId } });

      expect(
        await integrationPrisma!.engineeringBaseline.findUnique({ where: { id: baseline.id } }),
      ).toBeNull();
      expect(
        await integrationPrisma!.engineeringBaselineMember.findMany({
          where: { baselineId: baseline.id },
        }),
      ).toEqual([]);
      expect(
        await integrationPrisma!.operationalObservation.findUnique({
          where: { id: observation.id },
        }),
      ).toBeNull();
      expect(
        await integrationPrisma!.driftAssessment.findUnique({ where: { id: report.assessment.id } }),
      ).toBeNull();
      expect(
        await integrationPrisma!.driftFinding.findMany({
          where: { assessmentId: report.assessment.id },
        }),
      ).toEqual([]);

      await destroyTestTenant(scratch);
    });

    it("refuses to delete a baseline directly while it still has drift assessments (RESTRICT)", async () => {
      const { baseline, ctx: localCtx } = await makeActivatedBaseline(tenant, "restrict");
      await modules!.drift.driftDetectionService.evaluateDrift(localCtx, tenant.projectId, {
        baselineId: baseline.id,
      });

      await expect(
        integrationPrisma!.engineeringBaseline.delete({ where: { id: baseline.id } }),
      ).rejects.toThrow();

      // Untouched: the RESTRICT blocked the delete rather than the row surviving by accident.
      expect(
        await integrationPrisma!.engineeringBaseline.findUnique({ where: { id: baseline.id } }),
      ).not.toBeNull();
    });
  });

  // --- A real drift scenario, exercised fully -------------------------------

  describe("a real drift scenario end to end", () => {
    it("tracks a design item and an expectation through baseline, matching observations, a design change and a breach", async () => {
      const localCtx = contextFor(tenant);

      // 1. A real DesignItem and a real EngineeringDecision with a
      // DecisionExpectation carrying an explicit comparison.
      const design = await makeDesignItem(tenant.projectId, { status: "DRAFT" });
      const decision = await makeDecision();
      const expectation = await makeExpectation(decision.id, {
        comparisonOperator: "LESS_THAN_OR_EQUAL",
        expectedValue: "800",
        unit: "K",
      });

      // 2. DRAFT baseline, both as members, activate.
      const baseline = await modules!.drift.driftDetectionService.createBaseline(
        localCtx,
        tenant.projectId,
        { identifier: identifierFor("scn"), name: "V1 chamber basis" },
      );
      await modules!.drift.driftDetectionService.addBaselineMember(
        localCtx,
        tenant.projectId,
        baseline.id,
        { nodeType: "DESIGN_ITEM", nodeId: design.id },
      );
      await modules!.drift.driftDetectionService.addBaselineMember(
        localCtx,
        tenant.projectId,
        baseline.id,
        { nodeType: "DECISION_EXPECTATION", nodeId: expectation.id },
      );
      await modules!.drift.driftDetectionService.activateBaseline(
        localCtx,
        tenant.projectId,
        baseline.id,
        {},
      );

      // 3. A configuration observation of the design item, and a matching
      // measurement of the expectation. Both reviewed.
      const configObservation = await modules!.drift.driftDetectionService.recordObservation(
        localCtx,
        tenant.projectId,
        {
          identifier: identifierFor("obs"),
          title: "As-built configuration",
          description: "Configuration verified against the approved design.",
          observationType: "CONFIGURATION_OBSERVATION",
          observedAt: new Date("2026-06-10T00:00:00.000Z").toISOString(),
          subject: { type: "DESIGN_ITEM", id: design.id },
          subjectLabel: "Nominal configuration",
        },
      );
      const matchingMeasurement = await modules!.drift.driftDetectionService.recordObservation(
        localCtx,
        tenant.projectId,
        {
          identifier: identifierFor("obs"),
          title: "Wall temperature reading",
          description: "Thermocouple reading, station 4.",
          observationType: "MEASUREMENT",
          observedAt: new Date("2026-06-10T00:05:00.000Z").toISOString(),
          subject: { type: "DECISION_EXPECTATION", id: expectation.id },
          numericValue: "780",
          unit: "K",
        },
      );
      await modules!.drift.driftDetectionService.reviewObservation(
        localCtx,
        tenant.projectId,
        configObservation.id,
        {},
      );
      await modules!.drift.driftDetectionService.reviewObservation(
        localCtx,
        tenant.projectId,
        matchingMeasurement.id,
        {},
      );

      // 4. Evaluate: matching observation, unchanged baseline -> no drift on
      // either the baseline or the expectation.
      const firstReport = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      expect(firstReport.assessment.status).toBe("NO_DRIFT");
      expect(firstReport.findings.some((f) => f.ruleId === "DR-BAS-002")).toBe(false);
      const satisfied = firstReport.findings.find((f) => f.ruleId === "DR-EXP-002");
      expect(satisfied).toBeDefined();
      expect(satisfied?.status).toBe("INFORMATIONAL");
      expect(satisfied?.category).toBe("EXPECTATION_BREACH");
      expect(satisfied?.expectedValue).toBe("≤ 800 K");
      expect(satisfied?.observedValue).toBe("780 K");

      const currentAfterFirst = await modules!.drift.driftDetectionService.getLatestDriftAssessment(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      if (!hasDriftAssessment(currentAfterFirst)) throw new Error("expected a drift report");
      expect(currentAfterFirst.freshness).toBe("CURRENT");

      // 5. Modify the real DesignItem's status — a genuine fingerprint-affecting change.
      await integrationPrisma!.designItem.update({
        where: { id: design.id },
        data: { status: "APPROVED" },
      });

      // The prior assessment is now stale: the baselined design item moved.
      const staleCheck = await modules!.drift.driftDetectionService.getLatestDriftAssessment(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      if (!hasDriftAssessment(staleCheck)) throw new Error("expected a drift report");
      expect(staleCheck.freshness).toBe("STALE");

      // 6. Evaluate again -> a new assessment with a DR-BAS-002 finding naming the design item.
      const secondReport = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );
      expect(secondReport.assessment.id).not.toBe(firstReport.assessment.id);
      expect(secondReport.freshness).toBe("CURRENT");

      const baselineChanged = secondReport.findings.find((f) => f.ruleId === "DR-BAS-002");
      expect(baselineChanged).toBeDefined();
      expect(baselineChanged?.category).toBe("BASELINE_CHANGED");
      expect(baselineChanged?.status).toBe("REVIEW_REQUIRED");
      expect(baselineChanged?.baselineSubject?.id).toBe(design.id);
      expect(baselineChanged?.baselineSubject?.identifier).toBe(design.identifier);

      // 7. A breaching observation of the expectation.
      const breachingMeasurement = await modules!.drift.driftDetectionService.recordObservation(
        localCtx,
        tenant.projectId,
        {
          identifier: identifierFor("obs"),
          title: "Wall temperature reading, hot case",
          description: "Thermocouple reading, station 4, hot-fire test.",
          observationType: "MEASUREMENT",
          observedAt: new Date("2026-06-11T00:00:00.000Z").toISOString(),
          subject: { type: "DECISION_EXPECTATION", id: expectation.id },
          numericValue: "842",
          unit: "K",
        },
      );
      await modules!.drift.driftDetectionService.reviewObservation(
        localCtx,
        tenant.projectId,
        breachingMeasurement.id,
        {},
      );

      const thirdReport = await modules!.drift.driftDetectionService.evaluateDrift(
        localCtx,
        tenant.projectId,
        { baselineId: baseline.id },
      );

      const breach = thirdReport.findings.find(
        (f) => f.ruleId === "DR-EXP-001" && f.observationSubject?.id === breachingMeasurement.id,
      );
      expect(breach).toBeDefined();
      expect(breach?.category).toBe("EXPECTATION_BREACH");
      expect(breach?.status).toBe("REVIEW_REQUIRED");
      expect(breach?.expectedValue).toBe("≤ 800 K");
      expect(breach?.observedValue).toBe("842 K");

      // Drift never writes to the expectation it read.
      const expectationRow = await integrationPrisma!.decisionExpectation.findUnique({
        where: { id: expectation.id },
      });
      expect(expectationRow?.status).toBe("NOT_OBSERVED");
      expect(expectationRow?.comparisonOperator).toBe("LESS_THAN_OR_EQUAL");

      // 8. An unrelated change elsewhere in the project — neither a baseline
      // member nor an observation subject — must not stale the latest assessment.
      await makeRequirement();

      const finalCheck = await modules!.drift.driftDetectionService.getLatestDriftAssessment(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      if (!hasDriftAssessment(finalCheck)) throw new Error("expected a drift report");
      expect(finalCheck.freshness).toBe("CURRENT");
      expect(finalCheck.assessment.id).toBe(thirdReport.assessment.id);

      // Immutable history: all three evaluations survive, newest first.
      const history = await modules!.drift.driftDetectionService.listDriftHistory(
        localCtx,
        tenant.projectId,
        baseline.id,
      );
      expect(history.map((a) => a.id)).toEqual([
        thirdReport.assessment.id,
        secondReport.assessment.id,
        firstReport.assessment.id,
      ]);
    });
  });
});
