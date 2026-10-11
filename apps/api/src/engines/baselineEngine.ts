import { prisma } from '../db.js';
import { Baseline } from '@nexgen/shared-types';

export async function createProjectBaseline(params: {
  projectId: string;
  name: string;
  type?: 'Functional' | 'Allocated' | 'Product' | 'Release';
  description?: string;
  createdBy: string;
}) {
  const [requirements, architecture, verificationProcs, risks] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId: params.projectId } }),
    prisma.architectureElement.findMany({ where: { projectId: params.projectId } }),
    prisma.verificationProcedure.findMany({ where: { projectId: params.projectId } }),
    prisma.risk.findMany({ where: { projectId: params.projectId } }),
  ]);

  const count = await prisma.baseline.count({ where: { projectId: params.projectId } });
  const id = `BSL-${String(count + 1).padStart(3, '0')}`;

  const snapshotData = {
    requirements,
    architecture,
    verification: verificationProcs,
    risks,
    metadata: {
      totalReqs: requirements.length,
      totalArch: architecture.length,
      totalTests: verificationProcs.length,
      totalRisks: risks.length,
      timestamp: new Date().toISOString(),
    },
  };

  const baseline = await prisma.baseline.create({
    data: {
      id,
      projectId: params.projectId,
      name: params.name,
      type: params.type || 'Functional',
      description: params.description || '',
      snapshotData,
      createdBy: params.createdBy,
    },
  });

  return baseline;
}

export function compareBaselines(
  baselineA: any,
  baselineB: any
) {
  const dataA = (baselineA.snapshotData as any) || {};
  const dataB = (baselineB.snapshotData as any) || {};

  const reqsA: any[] = dataA.requirements || [];
  const reqsB: any[] = dataB.requirements || [];

  const addedReqs = reqsB.filter((b) => !reqsA.some((a) => a.id === b.id));
  const removedReqs = reqsA.filter((a) => !reqsB.some((b) => b.id === a.id));
  const changedReqs = reqsB
    .filter((b) => {
      const a = reqsA.find((item) => item.id === b.id);
      return a && (a.text !== b.text || a.status !== b.status || a.allocatedTo !== b.allocatedTo);
    })
    .map((b) => {
      const a = reqsA.find((item) => item.id === b.id);
      return {
        id: b.id,
        before: a,
        after: b,
      };
    });

  return {
    baselineA: { id: baselineA.id, name: baselineA.name, createdAt: baselineA.createdAt },
    baselineB: { id: baselineB.id, name: baselineB.name, createdAt: baselineB.createdAt },
    requirementsDiff: {
      added: addedReqs,
      removed: removedReqs,
      changed: changedReqs,
    },
  };
}
