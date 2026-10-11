import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeRequirementQuality } from '../engines/qualityEngine.js';
import { evaluateGateReadiness } from '../engines/gateEngine.js';
import { analyzeChangeImpact } from '../engines/impactEngine.js';
import { prisma } from '../db.js';

describe('Engineering Domain Engines', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Requirement Quality Advisory Engine', () => {
    it('detects ambiguous and subjective phrasing', () => {
      const results = analyzeRequirementQuality({
        text: 'The actuator shall provide fast and adequate response.',
        rationale: '',
        allocatedTo: null,
        verificationMethod: 'Test',
      });

      const ambiguousRule = results.find((r) => r.ruleId === 'REQ-QUAL-002');
      expect(ambiguousRule).toBeDefined();
      expect(ambiguousRule?.severity).toBe('Warning');

      const orphanRule = results.find((r) => r.ruleId === 'REQ-QUAL-005');
      expect(orphanRule).toBeDefined();
      expect(orphanRule?.message).toContain('Orphaned requirement');
    });

    it('passes high-quality well-formed requirement statements', () => {
      const results = analyzeRequirementQuality({
        text: 'The actuator assembly mass shall not exceed 2.0 kg.',
        rationale: 'Derived from aircraft mass allocation budget.',
        allocatedTo: 'SYS-001',
        verificationMethod: 'Inspection',
      });

      const errors = results.filter((r) => r.severity === 'Error');
      expect(errors.length).toBe(0);
    });
  });

  describe('Stage Gate & Release Evaluation Engine', () => {
    it('blocks gate release when there is a failed test', async () => {
      const evalResult = await evaluateGateReadiness('PRJ-AERO-01');
      // In the seed data, VRF-002 failed, so gate must be BLOCKED!
      expect(evalResult.isReady).toBe(false);
      expect(evalResult.blockersCount).toBeGreaterThan(0);

      const vrfCriteria = evalResult.criteria.find((c) => c.id === 'GATE-VRF-01');
      expect(vrfCriteria?.status).toBe('Blocked');
      expect(vrfCriteria?.details).toContain('FAILED');
    });
  });

  describe('Automated Ripple Effect Change Impact Engine', () => {
    it('identifies downstream architecture, invalidated tests, and re-opened risks for REQ-002', async () => {
      const impactAnalysis = await analyzeChangeImpact({
        projectId: 'PRJ-AERO-01',
        targetReqId: 'REQ-002',
      });

      expect(impactAnalysis.target.id).toBe('REQ-002');
      expect(impactAnalysis.impacts.length).toBeGreaterThan(0);

      const invalidatedTest = impactAnalysis.impacts.find(
        (i) => i.impactType === 'Invalidates Verification'
      );
      expect(invalidatedTest).toBeDefined();
      expect(invalidatedTest?.requiresRetest).toBe(true);

      const reopenedRisk = impactAnalysis.impacts.find(
        (i) => i.impactType === 'Re-opens Risk'
      );
      expect(reopenedRisk).toBeDefined();
    });
  });
});
