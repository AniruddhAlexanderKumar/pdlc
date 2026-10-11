import { prisma } from '../db.js';
import { ReleaseEvaluation, ReleaseGateCriteria } from '@nexgen/shared-types';

export async function evaluateGateReadiness(projectId: string): Promise<ReleaseEvaluation> {
  const [
    requirements,
    verificationProcs,
    risks,
    nonconformances,
    changeRequests,
  ] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId } }),
    prisma.verificationProcedure.findMany({ where: { projectId } }),
    prisma.risk.findMany({ where: { projectId } }),
    prisma.nonconformance.findMany({ where: { projectId } }),
    prisma.engineeringChangeRequest.findMany({ where: { projectId } }),
  ]);

  const criteria: ReleaseGateCriteria[] = [];

  // Criteria 1: Verification Execution Results (Must have 0 failed tests)
  const failedTests = verificationProcs.filter((v) => v.status === 'Failed');
  const pendingTests = verificationProcs.filter((v) => v.status !== 'Passed' && v.status !== 'Failed');
  
  if (failedTests.length > 0) {
    criteria.push({
      id: 'GATE-VRF-01',
      name: 'Verification Test Execution Integrity',
      status: 'Blocked',
      details: `${failedTests.length} verification procedure(s) currently in FAILED state (${failedTests.map(t => t.id).join(', ')}).`,
      isMandatory: true,
    });
  } else if (pendingTests.length > 0) {
    criteria.push({
      id: 'GATE-VRF-01',
      name: 'Verification Test Execution Integrity',
      status: 'Blocked',
      details: `${pendingTests.length} verification procedure(s) incomplete or awaiting execution (${pendingTests.map(t => t.id).join(', ')}).`,
      isMandatory: true,
    });
  } else {
    criteria.push({
      id: 'GATE-VRF-01',
      name: 'Verification Test Execution Integrity',
      status: 'Met',
      details: `All ${verificationProcs.length} verification procedures executed and PASSED.`,
      isMandatory: true,
    });
  }

  // Criteria 2: Requirement Allocation to Architecture
  const unallocatedReqs = requirements.filter((r) => !r.allocatedTo);
  if (unallocatedReqs.length > 0) {
    criteria.push({
      id: 'GATE-REQ-01',
      name: 'Requirement Architecture Allocation',
      status: 'Blocked',
      details: `${unallocatedReqs.length} requirement(s) unallocated to any system element (${unallocatedReqs.map(r => r.id).join(', ')}).`,
      isMandatory: true,
    });
  } else {
    criteria.push({
      id: 'GATE-REQ-01',
      name: 'Requirement Architecture Allocation',
      status: 'Met',
      details: `All ${requirements.length} requirements successfully allocated to PBS architecture elements.`,
      isMandatory: true,
    });
  }

  // Criteria 3: Requirements Baselined
  const unbaselinedReqs = requirements.filter((r) => r.status !== 'Baselined');
  if (unbaselinedReqs.length > 0) {
    criteria.push({
      id: 'GATE-REQ-02',
      name: 'Requirement Baselining Maturity',
      status: 'Blocked',
      details: `${unbaselinedReqs.length} requirement(s) not yet baselined (${unbaselinedReqs.map(r => r.id).join(', ')}).`,
      isMandatory: true,
    });
  } else {
    criteria.push({
      id: 'GATE-REQ-02',
      name: 'Requirement Baselining Maturity',
      status: 'Met',
      details: `All ${requirements.length} requirements have formal Baselined status.`,
      isMandatory: true,
    });
  }

  // Criteria 4: Safety & Technical Risks
  const highRisks = risks.filter((r) => r.status === 'Open' && (r.severity === 'High' || r.severity === 'Critical'));
  if (highRisks.length > 0) {
    criteria.push({
      id: 'GATE-RSK-01',
      name: 'Safety & Risk Mitigation Posture',
      status: 'Blocked',
      details: `${highRisks.length} High/Critical risk(s) remain open without approved mitigation (${highRisks.map(r => r.id).join(', ')}).`,
      isMandatory: true,
    });
  } else {
    criteria.push({
      id: 'GATE-RSK-01',
      name: 'Safety & Risk Mitigation Posture',
      status: 'Met',
      details: 'All critical technical hazards have active or accepted mitigations.',
      isMandatory: true,
    });
  }

  // Criteria 5: Quality & Nonconformance Closure
  const openNCs = nonconformances.filter((nc) => nc.status !== 'Closed');
  if (openNCs.length > 0) {
    criteria.push({
      id: 'GATE-QLT-01',
      name: 'Quality Nonconformance Dispositions',
      status: 'Blocked',
      details: `${openNCs.length} nonconformance investigation(s) remain open (${openNCs.map(n => n.id).join(', ')}).`,
      isMandatory: true,
    });
  } else {
    criteria.push({
      id: 'GATE-QLT-01',
      name: 'Quality Nonconformance Dispositions',
      status: 'Met',
      details: 'All recorded nonconformances are formally closed with verified corrective action.',
      isMandatory: true,
    });
  }

  // Criteria 6: Open Engineering Changes (ECRs)
  const pendingECRs = changeRequests.filter((e) => e.status !== 'Closed' && e.status !== 'Rejected' && e.status !== 'Implemented');
  if (pendingECRs.length > 0) {
    criteria.push({
      id: 'GATE-CHG-01',
      name: 'Configuration Change Board Clearance',
      status: 'Blocked',
      details: `${pendingECRs.length} engineering change request(s) pending review or implementation.`,
      isMandatory: false,
    });
  } else {
    criteria.push({
      id: 'GATE-CHG-01',
      name: 'Configuration Change Board Clearance',
      status: 'Met',
      details: 'No pending or unreviewed ECRs in flight.',
      isMandatory: false,
    });
  }

  const mandatoryBlockers = criteria.filter((c) => c.isMandatory && c.status === 'Blocked');
  const isReady = mandatoryBlockers.length === 0;

  return {
    isReady,
    blockersCount: mandatoryBlockers.length,
    criteria,
  };
}
