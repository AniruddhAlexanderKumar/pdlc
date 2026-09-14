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
 * The Decision Sentinel against real PostgreSQL.
 *
 * The unit suites (`src/domain/sentinel.test.ts`,
 * `src/server/services/decision-sentinel.service.test.ts`) fake every
 * repository and every one of the six engines, so they prove the dependency
 * registry, the membership logic and the dispatch wiring in the abstract.
 * This suite runs the real path: the real `sentinel_events` /
 * `surveillance_targets` tables and their constraints — the append-only
 * unique revision key, the partial unique index that allows at most one OPEN
 * row per (project, targetType, targetId) even under a genuine concurrent
 * race, the RESTRICT from a target back to its source event, project
 * cascades — and a real cross-engine scenario: a real requirement, design
 * item, decision, assumption, verification activity, change request and
 * certification program, real assessments from the real
 * verification-readiness, technical-readiness, change-impact, drift and
 * certification-review engines, a real relationship-change audit row, real
 * content changes, and a real reevaluation that reruns the real engine and
 * writes a genuinely new assessment — never a second calculation of the
 * Sentinel's own.
 *
 * Repositories and services are imported dynamically, guarded by
 * `databaseAvailable`, because importing them pulls in `@/config/env`, which
 * refuses to load without `DATABASE_URL`. With no database the suite skips
 * rather than erroring.
 */

const modules = databaseAvailable
  ? {
      eventRepo: await import("@/server/repositories/sentinel-event.repository"),
      targetRepo: await import("@/server/repositories/surveillance-target.repository"),
      sentinel: await import("@/server/services/decision-sentinel.service"),
      requirementService: await import("@/server/services/requirement.service"),
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      itemService: await import("@/server/services/compliance-item.service"),
      review: await import("@/server/services/certification-review.service"),
      impact: await import("@/server/services/change-impact-analysis.service"),
      verification: await import("@/server/services/verification-readiness.service"),
      technical: await import("@/server/services/technical-readiness.service"),
      drift: await import("@/server/services/drift-detection.service"),
      assumption: await import("@/server/services/assumption-monitoring.service"),
      audit: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`Decision Sentinel against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("sentinel-primary");
    otherTenant = await createTestTenant("sentinel-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  // --- Fixtures ---------------------------------------------------------

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
  }

  /** A minimal, real SentinelEvent row — the FK a surveillance target must reference. */
  async function makeSentinelEvent(
    projectId = tenant.projectId,
    overrides: Partial<{
      sourceType: "REQUIREMENT";
      sourceId: string;
      sourceRevision: string;
    }> = {},
  ) {
    const events = await modules!.eventRepo.createEvents(projectId, [
      {
        projectId,
        eventType: "ENGINEERING_OBJECT_CHANGED",
        sourceType: overrides.sourceType ?? "REQUIREMENT",
        sourceId: overrides.sourceId ?? `fixture-${uniqueSuffix("src")}`,
        sourceIdentifier: "REQ-FIX",
        sourceLabel: "Fixture requirement",
        sourceRevision: overrides.sourceRevision ?? uniqueSuffix("rev"),
        actorId: null,
      },
    ]);
    return events[0]!;
  }

  // --- Sentinel events ----------------------------------------------------

  describe("sentinel events", () => {
    it("persists a real event and reads it back", async () => {
      const event = await makeSentinelEvent();

      const found = await modules!.eventRepo.findEventInProject(tenant.projectId, event.id);

      expect(found?.eventType).toBe("ENGINEERING_OBJECT_CHANGED");
      expect(found?.sourceType).toBe("REQUIREMENT");
    });

    it("**is idempotent by construction — the same revision is never recorded twice**", async () => {
      const sourceId = `fixture-${uniqueSuffix("dup")}`;
      const revision = uniqueSuffix("rev");

      const first = await makeSentinelEvent(tenant.projectId, { sourceId, sourceRevision: revision });
      const second = await modules!.eventRepo.createEvents(tenant.projectId, [
        {
          projectId: tenant.projectId,
          eventType: "ENGINEERING_OBJECT_CHANGED",
          sourceType: "REQUIREMENT",
          sourceId,
          sourceIdentifier: "REQ-FIX",
          sourceLabel: "Fixture requirement",
          sourceRevision: revision,
          actorId: null,
        },
      ]);

      // The second attempt records nothing new — skipDuplicates against the
      // real (projectId, sourceType, sourceId, sourceRevision) unique index.
      expect(second).toHaveLength(0);
      const rows = await integrationPrisma!.sentinelEvent.count({
        where: { projectId: tenant.projectId, sourceId, sourceRevision: revision },
      });
      expect(rows).toBe(1);
      void first;
    });

    it("never lists another project's events", async () => {
      const mine = await makeSentinelEvent(tenant.projectId);
      const theirs = await makeSentinelEvent(otherTenant.projectId);

      const list = await modules!.eventRepo.listEventsForProject(tenant.projectId);

      expect(list.map((e) => e.id)).toContain(mine.id);
      expect(list.map((e) => e.id)).not.toContain(theirs.id);
    });
  });

  // --- Surveillance targets ------------------------------------------------

  describe("surveillance targets", () => {
    it("upserts a fresh OPEN target", async () => {
      const event = await makeSentinelEvent();

      const result = await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId: `va-${uniqueSuffix("x")}`,
        targetIdentifier: "VA-FIX",
        targetLabel: "Fixture activity",
        reason: "test reason",
        sourceEventId: event.id,
      });

      expect(result.inserted).toBe(true);
      const stored = await modules!.targetRepo.findTargetInProject(tenant.projectId, result.id);
      expect(stored?.status).toBe("OPEN");
      expect(stored?.sourceLabel).toBe("Fixture requirement");
    });

    it("**allows at most one OPEN row per (project, targetType, targetId), even under a genuine concurrent race**", async () => {
      // This is the storm-protection property the partial unique index exists
      // for: two callers racing to open the same signal must not both win.
      const eventA = await makeSentinelEvent();
      const eventB = await makeSentinelEvent();
      const targetId = `va-race-${uniqueSuffix("x")}`;

      const [a, b] = await Promise.all([
        modules!.targetRepo.upsertOpenTarget({
          projectId: tenant.projectId,
          targetType: "VERIFICATION_READINESS",
          targetId,
          targetIdentifier: "VA-RACE",
          targetLabel: "Race target",
          reason: "reason A",
          sourceEventId: eventA.id,
        }),
        modules!.targetRepo.upsertOpenTarget({
          projectId: tenant.projectId,
          targetType: "VERIFICATION_READINESS",
          targetId,
          targetIdentifier: "VA-RACE",
          targetLabel: "Race target",
          reason: "reason B",
          sourceEventId: eventB.id,
        }),
      ]);

      const insertedCount = [a.inserted, b.inserted].filter(Boolean).length;
      expect(insertedCount).toBe(1);

      const rows = await integrationPrisma!.surveillanceTarget.findMany({
        where: {
          projectId: tenant.projectId,
          targetType: "VERIFICATION_READINESS",
          targetId,
          status: "OPEN",
        },
      });
      expect(rows).toHaveLength(1);
    });

    it("**guards acknowledgement against a concurrent acknowledge/resolve of the same target**", async () => {
      // Found during a later adversarial security pass: upsertOpenTarget's
      // partial-index race safety (above) only protects target *creation*.
      // acknowledgeTarget/resolveTarget had the same read-decide-write shape
      // Prompt 27 guarded elsewhere (Requirement, Evidence, ...) without yet
      // reaching Sentinel's own downstream transitions.
      const event = await makeSentinelEvent();
      const targetId = `va-ack-race-${uniqueSuffix("x")}`;
      const { id } = await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId,
        targetIdentifier: "VA-ACK-RACE",
        targetLabel: "Acknowledge race target",
        reason: "reason",
        sourceEventId: event.id,
      });

      const results = await Promise.allSettled([
        modules!.targetRepo.acknowledgeTarget(id, "OPEN", tenant.userId, "first"),
        modules!.targetRepo.acknowledgeTarget(id, "OPEN", tenant.userId, "second"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const final = await modules!.targetRepo.findTargetInProject(tenant.projectId, id);
      expect(final?.status).toBe("ACKNOWLEDGED");
    });

    it("**guards resolution against a concurrent acknowledge racing a resolve of the same target**", async () => {
      const event = await makeSentinelEvent();
      const targetId = `va-res-race-${uniqueSuffix("x")}`;
      const { id } = await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId,
        targetIdentifier: "VA-RES-RACE",
        targetLabel: "Resolve race target",
        reason: "reason",
        sourceEventId: event.id,
      });

      // Two different transitions racing from the same OPEN starting point —
      // not two identical calls — is the case a status-only guard actually
      // has to get right: whichever lands first must win outright, not
      // merge with the loser's data.
      const results = await Promise.allSettled([
        modules!.targetRepo.acknowledgeTarget(id, "OPEN", tenant.userId, "seen it"),
        modules!.targetRepo.resolveTarget(id, "OPEN", tenant.userId, "fixed it"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const final = await modules!.targetRepo.findTargetInProject(tenant.projectId, id);
      expect(["ACKNOWLEDGED", "RESOLVED"]).toContain(final?.status);
    });

    it("supersedes an ACKNOWLEDGED target when a fresh OPEN one is written for the same domain object", async () => {
      const targetId = `va-${uniqueSuffix("super")}`;
      const eventA = await makeSentinelEvent();
      const first = await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId,
        targetIdentifier: "VA-SUP",
        targetLabel: "Supersession target",
        reason: "first reason",
        sourceEventId: eventA.id,
      });
      await modules!.targetRepo.acknowledgeTarget(first.id, "OPEN", tenant.userId, "seen it");

      const eventB = await makeSentinelEvent();
      const second = await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId,
        targetIdentifier: "VA-SUP",
        targetLabel: "Supersession target",
        reason: "second reason",
        sourceEventId: eventB.id,
      });
      expect(second.inserted).toBe(true); // no OPEN row existed — the old one is ACKNOWLEDGED
      await modules!.targetRepo.supersedeAcknowledged(
        tenant.projectId,
        "VERIFICATION_READINESS",
        targetId,
        second.id,
      );

      const old = await integrationPrisma!.surveillanceTarget.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(old.status).toBe("SUPERSEDED");
      expect(old.supersededById).toBe(second.id);
    });

    it("refuses to delete a sentinel event while a surveillance target still references it (foreign key intact)", async () => {
      const event = await makeSentinelEvent();
      await modules!.targetRepo.upsertOpenTarget({
        projectId: tenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId: `va-${uniqueSuffix("fk")}`,
        targetIdentifier: "VA-FK",
        targetLabel: "FK target",
        reason: "test reason",
        sourceEventId: event.id,
      });

      await expect(
        integrationPrisma!.sentinelEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow();
    });

    it("cascades sentinel events and surveillance targets when the project is deleted", async () => {
      const shortLived = await createTestTenant("sentinel-cascade");
      try {
        const event = await makeSentinelEvent(shortLived.projectId);
        await modules!.targetRepo.upsertOpenTarget({
          projectId: shortLived.projectId,
          targetType: "VERIFICATION_READINESS",
          targetId: `va-${uniqueSuffix("cascade")}`,
          targetIdentifier: "VA-CASCADE",
          targetLabel: "Cascade target",
          reason: "test reason",
          sourceEventId: event.id,
        });

        await integrationPrisma!.project.delete({ where: { id: shortLived.projectId } });

        expect(
          await integrationPrisma!.sentinelEvent.count({ where: { projectId: shortLived.projectId } }),
        ).toBe(0);
        expect(
          await integrationPrisma!.surveillanceTarget.count({
            where: { projectId: shortLived.projectId },
          }),
        ).toBe(0);
      } finally {
        await destroyTestTenant(shortLived);
      }
    });

    it("never lists another project's targets as open", async () => {
      const event = await makeSentinelEvent(otherTenant.projectId);
      const created = await modules!.targetRepo.upsertOpenTarget({
        projectId: otherTenant.projectId,
        targetType: "VERIFICATION_READINESS",
        targetId: `va-${uniqueSuffix("iso")}`,
        targetIdentifier: "VA-ISO",
        targetLabel: "Isolation target",
        reason: "test reason",
        sourceEventId: event.id,
      });

      try {
        const mine = await modules!.targetRepo.listOpenTargets(tenant.projectId);
        expect(mine.every((t) => t.projectId === tenant.projectId)).toBe(true);
      } finally {
        // This row is otherTenant's, real and deliberately left OPEN to prove
        // the point above — but otherTenant is shared for the rest of this
        // file (one tenant per file, not per test), so leaving it here would
        // make every later "otherTenant has nothing open" assertion in this
        // file false for a reason those tests did not create.
        await integrationPrisma!.surveillanceTarget.delete({ where: { id: created.id } });
      }
    });
  });

  // --- A real cross-engine surveillance scenario, end to end ----------------

  describe("a real cross-engine surveillance scenario end to end", () => {
    it("detects real changes, opens targets only where a real basis actually references them, dispatches real reevaluation, and stays idempotent", async () => {
      const projectId = tenant.projectId;

      // 1. Build a real engineering graph.
      const requirement = await integrationPrisma!.requirement.create({
        data: {
          projectId,
          identifier: identifierFor("req"),
          title: "Maximum chamber pressure",
          statement: "The engine shall not exceed 120 bar.",
        },
      });
      const designItem = await integrationPrisma!.designItem.create({
        data: {
          projectId,
          identifier: identifierFor("di"),
          name: "Combustion chamber",
          itemType: "COMPONENT",
        },
      });
      const activity = await integrationPrisma!.verificationActivity.create({
        data: {
          projectId,
          identifier: identifierFor("va"),
          title: "Hot fire test",
          method: "TEST",
        },
      });
      // Through the real service, so this produces a genuine
      // "requirement.link_added" audit row — the Sentinel's relationship
      // change detection has nothing to detect without one.
      await modules!.requirementService.linkRequirement(ctx, projectId, requirement.id, {
        relation: "VERIFICATION_ACTIVITY",
        targetId: activity.id,
      });

      const decision = await integrationPrisma!.engineeringDecision.create({
        data: {
          projectId,
          identifier: identifierFor("ed"),
          title: "Use regenerative cooling",
          statement: "The chamber will be regeneratively cooled.",
          rationale: "Ablative liner mass was prohibitive.",
        },
      });
      const assumption = await integrationPrisma!.decisionAssumption.create({
        data: { engineeringDecisionId: decision.id, statement: "Coolant flow stays above 2.4 kg/s." },
      });

      const changeRequest = await integrationPrisma!.changeRequest.create({
        data: {
          projectId,
          identifier: identifierFor("cr"),
          title: "Raise the pressure limit",
          description: "Raise the chamber pressure limit to 130 bar.",
          reason: "Performance shortfall.",
          requestedById: tenant.userId,
        },
      });
      await integrationPrisma!.changeRequestImpact.create({
        data: {
          changeRequestId: changeRequest.id,
          requirementId: requirement.id,
          note: "The limit is stated here.",
          createdById: tenant.userId,
        },
      });

      const program = await modules!.programRepo.createProgram({
        projectId,
        identifier: identifierFor("cert"),
        name: "Cabin systems certification effort",
        description: null,
        ownerId: null,
      });
      const draftBasis = await modules!.basisRepo.createBasis({
        certificationProgramId: program.id,
        identifier: identifierFor("cb"),
        title: "Part 25 Amdt 25-141",
        description: null,
        revision: "Amdt 25-141",
        sourceReference: "14 CFR Part 25",
        createdById: tenant.userId,
      });
      await modules!.basisRepo.activateBasis(draftBasis.id, tenant.userId);
      const complianceItem = await modules!.itemService.complianceItemService.createItem(
        ctx,
        projectId,
        draftBasis.id,
        { identifier: identifierFor("ci"), title: "Chamber pressure limit" },
      );
      await modules!.itemService.complianceItemService.updateItem(ctx, projectId, complianceItem.id, {
        applicability: "APPLICABLE",
        method: "ANALYSIS",
      });
      await modules!.itemService.complianceItemService.addLink(ctx, projectId, complianceItem.id, {
        linkType: "REQUIREMENT",
        targetId: requirement.id,
      });

      const baseline = await modules!.drift.driftDetectionService.createBaseline(ctx, projectId, {
        identifier: identifierFor("bl"),
        name: "Engineering basis",
      });
      await modules!.drift.driftDetectionService.addBaselineMember(ctx, projectId, baseline.id, {
        nodeType: "DESIGN_ITEM",
        nodeId: designItem.id,
      });
      const activeBaseline = await modules!.drift.driftDetectionService.activateBaseline(
        ctx,
        projectId,
        baseline.id,
        {},
      );

      // 2. Run every real engine once, so each writes a real assessment whose
      // basis genuinely references the requirement or design item above.
      await modules!.verification.verificationReadinessService.evaluateVerificationReadiness(
        ctx,
        projectId,
        activity.id,
      );
      await modules!.technical.technicalReadinessService.evaluateTechnicalReadiness(ctx, projectId, {
        gate: "SYSTEM_DEFINITION",
      });
      await modules!.impact.changeImpactAnalysisService.runImpactAnalysis(
        ctx,
        projectId,
        changeRequest.id,
      );
      await modules!.review.certificationReviewService.evaluateCertificationReview(ctx, projectId, {});
      await modules!.drift.driftDetectionService.evaluateDrift(ctx, projectId, {
        baselineId: activeBaseline.id,
      });
      await modules!.assumption.assumptionMonitoringService.evaluateAssumption(
        ctx,
        projectId,
        decision.id,
        assumption.id,
      );

      // 3. First detection: nothing has *content*-changed since creation, but
      // the real relationship link is a real, recognized audit event — and it
      // reaches four real assessments' real bases.
      const first = await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, projectId);
      expect(first.eventsCreated).toBeGreaterThanOrEqual(1);
      expect(first.targetsOpened).toBeGreaterThanOrEqual(4);

      const openAfterFirst = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        projectId,
      );
      const typesAfterFirst = new Set(openAfterFirst.map((t) => t.targetType));
      expect(typesAfterFirst.has("IMPACT_ANALYSIS")).toBe(true);
      expect(typesAfterFirst.has("VERIFICATION_READINESS")).toBe(true);
      expect(typesAfterFirst.has("TECHNICAL_READINESS")).toBe(true);
      expect(typesAfterFirst.has("CERTIFICATION_REVIEW")).toBe(true);
      // Nothing baselined or assumption-related changed yet.
      expect(typesAfterFirst.has("DRIFT_ASSESSMENT")).toBe(false);
      expect(typesAfterFirst.has("ASSUMPTION_MONITORING")).toBe(false);

      const vrTargetAfterFirst = openAfterFirst.find((t) => t.targetType === "VERIFICATION_READINESS")!;
      expect(vrTargetAfterFirst.targetId).toBe(activity.id);
      const iaTargetAfterFirst = openAfterFirst.find((t) => t.targetType === "IMPACT_ANALYSIS")!;
      expect(iaTargetAfterFirst.targetId).toBe(changeRequest.id);

      // 4. Real changes: a baselined design item, an assumption's own
      // statement, and a fresh observation. The requirement changes again
      // too — its four targets already exist, so this must *update* them,
      // never duplicate them (the partial unique index would refuse a
      // second OPEN row outright).
      await integrationPrisma!.requirement.update({
        where: { id: requirement.id },
        data: { title: "Maximum chamber pressure (revised)" },
      });
      await integrationPrisma!.designItem.update({
        where: { id: designItem.id },
        data: { name: "Combustion chamber (revised)" },
      });
      await integrationPrisma!.decisionAssumption.update({
        where: { id: assumption.id },
        data: { statement: "Coolant flow stays above 2.6 kg/s." },
      });
      await modules!.drift.driftDetectionService.recordObservation(ctx, projectId, {
        identifier: identifierFor("obs"),
        title: "Post-test inspection",
        description: "Visual inspection after hot fire.",
        observationType: "OTHER",
        observedAt: new Date().toISOString(),
        textValue: "No visible damage.",
      });

      const second = await modules!.sentinel.decisionSentinelService.detectProjectChanges(
        ctx,
        projectId,
      );
      expect(second.eventsCreated).toBeGreaterThanOrEqual(4);

      const openAfterSecond = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        projectId,
      );
      const typesAfterSecond = new Set(openAfterSecond.map((t) => t.targetType));
      // The two new domains now appear...
      expect(typesAfterSecond.has("DRIFT_ASSESSMENT")).toBe(true);
      expect(typesAfterSecond.has("ASSUMPTION_MONITORING")).toBe(true);
      // ...and the original four are still open, never duplicated: at most one
      // OPEN row per (targetType, targetId), so the list has exactly one
      // entry per distinct domain object.
      const keyOf = (t: { targetType: string; targetId: string }) => `${t.targetType}:${t.targetId}`;
      const keys = openAfterSecond.map(keyOf);
      expect(new Set(keys).size).toBe(keys.length);
      expect(typesAfterSecond.size).toBe(6);

      // 5. Acknowledge, then reevaluate through the real dispatch — the real
      // verification-readiness engine runs again and writes a genuinely new
      // assessment, never a fabricated one.
      const vrTarget = openAfterSecond.find((t) => t.targetType === "VERIFICATION_READINESS")!;
      const acknowledged = await modules!.sentinel.decisionSentinelService.acknowledgeSurveillance(
        ctx,
        projectId,
        vrTarget.id,
        { note: "Reviewing." },
      );
      expect(acknowledged.status).toBe("ACKNOWLEDGED");

      const assessmentsBefore = await integrationPrisma!.verificationReadinessAssessment.count({
        where: { verificationActivityId: activity.id },
      });
      const reevaluated = await modules!.sentinel.decisionSentinelService.reEvaluateTarget(
        ctx,
        projectId,
        vrTarget.id,
      );
      expect(reevaluated.status).toBe("RESOLVED");
      expect(reevaluated.resolutionNote).toMatch(/resolved automatically/i);
      const assessmentsAfter = await integrationPrisma!.verificationReadinessAssessment.count({
        where: { verificationActivityId: activity.id },
      });
      expect(assessmentsAfter).toBe(assessmentsBefore + 1);

      // 6. Resolve the drift target directly, with an explicit note.
      const driftTarget = openAfterSecond.find((t) => t.targetType === "DRIFT_ASSESSMENT")!;
      const resolvedDrift = await modules!.sentinel.decisionSentinelService.resolveSurveillance(
        ctx,
        projectId,
        driftTarget.id,
        { note: "Reviewed manually; no reassessment necessary." },
      );
      expect(resolvedDrift.status).toBe("RESOLVED");
      expect(resolvedDrift.resolutionNote).toBe("Reviewed manually; no reassessment necessary.");

      // 7. Detecting again with nothing new changed creates nothing new — the
      // Sentinel does not invent signals from an unchanged record.
      const third = await modules!.sentinel.decisionSentinelService.detectProjectChanges(
        ctx,
        projectId,
      );
      expect(third).toEqual({ eventsCreated: 0, targetsOpened: 0, targetsUpdated: 0 });

      // 8. History carries what was actually resolved, and nothing else.
      const history = await modules!.sentinel.decisionSentinelService.listSurveillanceHistory(
        ctx,
        projectId,
      );
      const historyIds = history.map((t) => t.id);
      expect(historyIds).toContain(vrTarget.id);
      expect(historyIds).toContain(driftTarget.id);
      const stillOpen = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        projectId,
      );
      expect(stillOpen.map((t) => t.id)).not.toContain(vrTarget.id);
      expect(stillOpen.map((t) => t.id)).not.toContain(driftTarget.id);

      // 9. None of this ever reached the other tenant's project.
      const theirs = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        { organizationId: otherTenant.organizationId, actorId: otherTenant.userId },
        otherTenant.projectId,
      );
      expect(theirs).toHaveLength(0);

      // 10. Every detection run left exactly one audit event of its own kind —
      // never one row per target, and never the full target array.
      const detectionAudits = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "Project",
        entityId: projectId,
      });
      const runs = detectionAudits.filter((e) => e.action === "sentinel.detection_run");
      expect(runs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
