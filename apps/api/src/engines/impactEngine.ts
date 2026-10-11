import { prisma } from '../db.js';
import { ChangeImpactItem } from '@nexgen/shared-types';

export async function analyzeChangeImpact(params: {
  projectId: string;
  targetReqId?: string | null;
  targetSysId?: string | null;
}): Promise<{
  target: { id: string; type: string; title: string };
  impacts: ChangeImpactItem[];
}> {
  const impacts: ChangeImpactItem[] = [];
  let target = { id: '', type: '', title: '' };

  if (params.targetReqId) {
    const req = await prisma.requirement.findUnique({
      where: { id: params.targetReqId },
      include: {
        architecture: true,
        verificationProcs: true,
        risks: true,
        nonconformances: true,
        children: true,
      },
    });

    if (!req) {
      throw new Error(`Target Requirement ${params.targetReqId} not found.`);
    }

    target = {
      id: req.id,
      type: 'Requirement',
      title: req.text,
    };

    // 1. Direct Target Impact
    impacts.push({
      id: `IMP-${req.id}`,
      objectType: 'Requirement',
      objectId: req.id,
      title: req.text,
      impactType: 'Direct Target',
      reason: 'Originating subject of proposed engineering change.',
    });

    // 2. Allocated Architecture Element
    if (req.architecture) {
      impacts.push({
        id: `IMP-${req.architecture.id}`,
        objectType: 'Architecture',
        objectId: req.architecture.id,
        title: req.architecture.name,
        impactType: 'Allocation Affected',
        reason: `Allocated element '${req.architecture.name}' (${req.architecture.type}) physical/functional specs directly impacted.`,
      });
    }

    // 3. Verification Procedures (Invalidation of past evidence)
    for (const vrf of req.verificationProcs) {
      impacts.push({
        id: `IMP-${vrf.id}`,
        objectType: 'Verification',
        objectId: vrf.id,
        title: vrf.name,
        impactType: 'Invalidates Verification',
        reason: `Procedure verifies ${req.id}. Requirement revision invalidates previous test evidence and mandates re-test.`,
        requiresRetest: true,
      });
    }

    // 4. Linked Risks
    for (const rsk of req.risks) {
      impacts.push({
        id: `IMP-${rsk.id}`,
        objectType: 'Risk',
        objectId: rsk.id,
        title: rsk.title,
        impactType: 'Re-opens Risk',
        reason: `Safety risk '${rsk.title}' relates directly to ${req.id}. Mitigations and residual risk require re-assessment.`,
      });
    }

    // 5. Child / Derived Requirements
    for (const child of req.children) {
      impacts.push({
        id: `IMP-${child.id}`,
        objectType: 'Requirement',
        objectId: child.id,
        title: child.text,
        impactType: 'Parent Impact',
        reason: `Derived child requirement depends on upstream parent ${req.id}.`,
      });
    }
  } else if (params.targetSysId) {
    const sys = await prisma.architectureElement.findUnique({
      where: { id: params.targetSysId },
      include: {
        allocatedReqs: {
          include: {
            verificationProcs: true,
            risks: true,
          },
        },
        children: true,
        risks: true,
      },
    });

    if (!sys) {
      throw new Error(`Target Architecture Element ${params.targetSysId} not found.`);
    }

    target = {
      id: sys.id,
      type: 'Architecture',
      title: sys.name,
    };

    impacts.push({
      id: `IMP-${sys.id}`,
      objectType: 'Architecture',
      objectId: sys.id,
      title: sys.name,
      impactType: 'Direct Target',
      reason: 'Originating architecture item selected for physical/functional modification.',
    });

    // Allocated Requirements impacted
    for (const req of sys.allocatedReqs) {
      impacts.push({
        id: `IMP-${req.id}`,
        objectType: 'Requirement',
        objectId: req.id,
        title: req.text,
        impactType: 'Allocation Affected',
        reason: `Requirement allocated to modified architecture component ${sys.name}.`,
      });

      for (const vrf of req.verificationProcs) {
        impacts.push({
          id: `IMP-${vrf.id}`,
          objectType: 'Verification',
          objectId: vrf.id,
          title: vrf.name,
          impactType: 'Invalidates Verification',
          reason: `Verification test evidence invalidated by component redesign.`,
          requiresRetest: true,
        });
      }
    }

    // Direct system risks
    for (const rsk of sys.risks) {
      impacts.push({
        id: `IMP-${rsk.id}`,
        objectType: 'Risk',
        objectId: rsk.id,
        title: rsk.title,
        impactType: 'Re-opens Risk',
        reason: `Subsystem safety hazard '${rsk.title}' requires safety review post-redesign.`,
      });
    }
  }

  return { target, impacts };
}
