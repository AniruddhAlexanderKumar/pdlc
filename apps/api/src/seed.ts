import { prisma } from './db.js';
import { hashPassword } from './auth.js';
import { createProjectBaseline } from './engines/baselineEngine.js';

export async function seedDatabase() {
  console.log('[Seed] Starting authoritative database seed for NexGen PLM...');

  // 1. Clean existing records to ensure clean reproducible demo
  await prisma.auditEvent.deleteMany({});
  await prisma.taskItem.deleteMany({});
  await prisma.documentRecord.deleteMany({});
  await prisma.releaseRecord.deleteMany({});
  await prisma.baseline.deleteMany({});
  await prisma.changeImpact.deleteMany({});
  await prisma.engineeringChangeOrder.deleteMany({});
  await prisma.engineeringChangeRequest.deleteMany({});
  await prisma.nonconformance.deleteMany({});
  await prisma.risk.deleteMany({});
  await prisma.verificationExecution.deleteMany({});
  await prisma.verificationProcedure.deleteMany({});
  await prisma.requirement.deleteMany({});
  await prisma.architectureElement.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // 2. Organization
  const org = await prisma.organization.create({
    data: {
      name: 'NexGen Aerospace Systems',
      code: 'AERO-SYS',
    },
  });

  // 3. Users with real hashed passwords
  const passwordHash = await hashPassword('password123');
  const adminHash = await hashPassword('admin123');

  const engineer = await prisma.user.create({
    data: {
      email: 'engineer@nexgen.os',
      name: 'Dr. Elena Rostova',
      passwordHash,
      role: 'SystemsEngineer',
      title: 'Chief Systems Engineer',
      organizationId: org.id,
    },
  });

  const qualityUser = await prisma.user.create({
    data: {
      email: 'quality@nexgen.os',
      name: 'Marcus Vance',
      passwordHash,
      role: 'QualityEngineer',
      title: 'Quality Assurance Lead',
      organizationId: org.id,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@nexgen.os',
      name: 'Alex Mercer',
      passwordHash: adminHash,
      role: 'OrgAdmin',
      title: 'VP of Engineering Systems',
      organizationId: org.id,
    },
  });

  // 4. Project
  const project = await prisma.project.create({
    data: {
      id: 'PRJ-AERO-01',
      name: 'NextGen Electromechanical Actuator',
      description: 'Flight-critical high-bandwidth primary flight control surface actuator.',
      phase: 'Detailed Design',
      status: 'Active',
      ownerId: engineer.id,
      organizationId: org.id,
      targetReleaseDate: new Date('2027-04-15'),
    },
  });

  // 5. Opportunity
  await prisma.opportunity.create({
    data: {
      id: 'OPP-001',
      projectId: project.id,
      title: 'Mass Reduction & Bandwidth Optimization Program',
      problem: 'Current primary flight actuator exceeds 2.4kg weight allocation and limits control authority bandwidth.',
      justification: 'Weight saving yields 140kg total aircraft takeoff mass reduction and 12% lower power consumption.',
      status: 'Approved',
      targetDeliveryDate: new Date('2026-12-01'),
    },
  });

  // 6. Architecture Breakdown (PBS)
  const sys1 = await prisma.architectureElement.create({
    data: {
      id: 'SYS-001',
      projectId: project.id,
      name: 'Actuator Assembly',
      description: 'Complete flight actuator line-replaceable unit (LRU).',
      type: 'System',
      status: 'Approved',
      revision: 1,
    },
  });

  const sys2 = await prisma.architectureElement.create({
    data: {
      id: 'SYS-002',
      projectId: project.id,
      name: 'Brushless DC Motor',
      description: 'Rare-earth permanent magnet synchronous motor with high power density.',
      type: 'Component',
      parentId: sys1.id,
      status: 'Approved',
      revision: 1,
    },
  });

  const sys3 = await prisma.architectureElement.create({
    data: {
      id: 'SYS-003',
      projectId: project.id,
      name: 'Motor Controller PCBA',
      description: 'FPGA-driven dual-redundant vector field-oriented inverter controller.',
      type: 'Electronic Hardware',
      parentId: sys1.id,
      status: 'Approved',
      revision: 1,
    },
  });

  const sys4 = await prisma.architectureElement.create({
    data: {
      id: 'SYS-004',
      projectId: project.id,
      name: 'Gear Train',
      description: 'Planetary roller screw gear reducer with 45:1 mechanical advantage.',
      type: 'Component',
      parentId: sys1.id,
      status: 'Approved',
      revision: 1,
    },
  });

  // 7. Requirements
  const req1 = await prisma.requirement.create({
    data: {
      id: 'REQ-001',
      projectId: project.id,
      title: 'Assembly Total Mass Limit',
      text: 'The actuator assembly mass shall not exceed 2.0 kg.',
      rationale: 'Derived from airframe avionics weight allocation budget SWaP-C.',
      type: 'Physical',
      status: 'Baselined',
      allocatedTo: sys1.id,
      verificationMethod: 'Inspection',
      priority: 'High',
      revision: 1,
    },
  });

  const req2 = await prisma.requirement.create({
    data: {
      id: 'REQ-002',
      projectId: project.id,
      title: 'Stroke Transit Response Time',
      text: 'Actuator stroke time shall be < 0.8s under 5kN peak dynamic load.',
      rationale: 'Mandated by aerodynamic flutter damping and control loop bandwidth.',
      type: 'Performance',
      status: 'Baselined',
      allocatedTo: sys2.id,
      verificationMethod: 'Test',
      priority: 'Critical',
      revision: 1,
    },
  });

  const req3 = await prisma.requirement.create({
    data: {
      id: 'REQ-003',
      projectId: project.id,
      title: 'Flight Safety Reliability',
      text: 'Loss of function probability shall be < 1E-9 per flight hour.',
      rationale: 'Catastrophic failure hazard classification per ARP4761 / DO-178C DAL-A.',
      type: 'Safety',
      status: 'In Review',
      allocatedTo: sys1.id,
      verificationMethod: 'Analysis',
      priority: 'Critical',
      revision: 1,
    },
  });

  const req4 = await prisma.requirement.create({
    data: {
      id: 'REQ-004',
      projectId: project.id,
      title: 'Mechanical Flange Interface',
      text: 'The actuator shall mount using standard 4-bolt flange geometry.',
      rationale: 'Standardized mechanical bay mounting interface for line replacement.',
      type: 'Interface',
      status: 'Draft',
      allocatedTo: sys1.id,
      verificationMethod: 'Inspection',
      priority: 'Medium',
      revision: 1,
    },
  });

  // 8. Verification Procedures & Executions
  const vrf1 = await prisma.verificationProcedure.create({
    data: {
      id: 'VRF-001',
      projectId: project.id,
      name: 'Mass Measurement Test',
      method: 'Inspection',
      reqId: req1.id,
      acceptanceCriteria: 'Calibrated weight scale measurement must be <= 2.000 kg with all harness connectors installed.',
      status: 'Passed',
      resultSummary: 'Measured 1.95kg (Passes <=2.0kg margin +0.05kg).',
    },
  });

  await prisma.verificationExecution.create({
    data: {
      procedureId: vrf1.id,
      executionNumber: 1,
      testConfiguration: 'Metrology Lab Scale S/N 8412, calibrated ISO 17025',
      executorId: engineer.email,
      outcome: 'Passed',
      measurements: [
        { parameter: 'Total Mass', expected: '<= 2.00 kg', actual: '1.95 kg', unit: 'kg', pass: true }
      ],
      observations: 'Actuator serial #001 measured with all harness connectors installed. Passed.',
    },
  });

  const vrf2 = await prisma.verificationProcedure.create({
    data: {
      id: 'VRF-002',
      projectId: project.id,
      name: 'Dynamic Load Test',
      method: 'Test',
      reqId: req2.id,
      acceptanceCriteria: 'Stroke time from 0 to 100mm must complete in < 0.800s under constant 5kN opposing force.',
      status: 'Failed',
      resultSummary: 'Stroke time 0.92s (Fails <0.8s requirement under 5kN peak load).',
    },
  });

  await prisma.verificationExecution.create({
    data: {
      procedureId: vrf2.id,
      executionNumber: 1,
      testConfiguration: 'Hydraulic Dynamometer Rig #4, ambient 23°C',
      executorId: engineer.email,
      witness: qualityUser.email,
      outcome: 'Failed',
      measurements: [
        { parameter: 'Full Stroke Duration', expected: '< 0.80 s', actual: '0.92 s', unit: 's', pass: false },
        { parameter: 'Applied Peak Load', expected: '5.0 kN', actual: '5.0 kN', unit: 'kN', pass: true }
      ],
      observations: 'Motor reached thermal saturation limit at 4.2kN. Slew rate degraded to 108mm/s, resulting in 0.92s transit duration.',
      deviations: 'Back-EMF limiting peak current drive.',
    },
  });

  const vrf3 = await prisma.verificationProcedure.create({
    data: {
      id: 'VRF-003',
      projectId: project.id,
      name: 'Flange Dimension Check',
      method: 'Inspection',
      reqId: req4.id,
      acceptanceCriteria: '4x M8 bolt hole center distances must be within 60.00 ± 0.05mm.',
      status: 'Planned',
      resultSummary: null,
    },
  });

  // 9. Risks
  await prisma.risk.create({
    data: {
      id: 'RSK-001',
      projectId: project.id,
      title: 'Motor Thermal Overload',
      cause: 'Continuous high dynamic load driving winding temperature above 180°C insulation rating.',
      consequence: 'Thermal demagnetization of rotor magnets leading to actuator torque stall in flight.',
      severity: 'High',
      likelihood: 'Possible',
      ratingScore: 12,
      linkedReq: req2.id,
      linkedSys: sys2.id,
      status: 'Open',
      mitigation: 'Active cooling jacket or stator rewinding with high copper fill factor.',
      mitigationOwner: engineer.email,
    },
  });

  await prisma.risk.create({
    data: {
      id: 'RSK-002',
      projectId: project.id,
      title: 'Supplier Lead Time for Flight PCBA',
      cause: 'Global shortage of automotive-grade FPGA microcontroller silicon.',
      consequence: 'Assembly integration schedule delay of 6-8 weeks.',
      severity: 'Medium',
      likelihood: 'Likely',
      ratingScore: 8,
      linkedReq: null,
      linkedSys: sys3.id,
      status: 'Mitigated',
      mitigation: 'Dual sourcing qualified alternative suppliers and pre-ordering lot buy.',
      mitigationOwner: qualityUser.email,
    },
  });

  // 10. Quality Nonconformance linked to Failed VRF-002
  await prisma.nonconformance.create({
    data: {
      id: 'NC-001',
      projectId: project.id,
      title: 'Test VRF-002 Failed: Dynamic Stroke Slew Rate Under Limit',
      description: 'During 5kN dynamometer load test, actuator stroke duration was 0.92s, exceeding allowable 0.8s ceiling.',
      severity: 'Major',
      linkedVrf: vrf2.id,
      linkedReq: req2.id,
      status: 'Investigation',
      containmentActions: 'Quarantine SN-001 prototype unit. Tag test bench. Halt Critical Design Review gate authorization.',
      rootCause: 'Motor winding resistance higher than simulated baseline, causing current limiting under peak torque demand.',
      proposedDisposition: 'Rework stator winding gauge and optimize FOC controller PWM timing.',
      reportedBy: qualityUser.email,
      assignedTo: engineer.email,
    },
  });

  // 11. Engineering Change Request
  const ecr1 = await prisma.engineeringChangeRequest.create({
    data: {
      id: 'ECR-001',
      projectId: project.id,
      title: 'Increase BLDC Motor Copper Fill to Restore 0.8s Stroke Speed',
      reason: 'Resolve dynamic load failure in VRF-002 and close Nonconformance NC-001.',
      proposedModification: 'Rewind motor stator using 0.65mm gauge magnet wire (Slot Fill Factor 54%), increasing peak torque from 4.8Nm to 5.7Nm.',
      targetReqId: req2.id,
      originatorId: engineer.email,
      status: 'Submitted',
      severity: 'Class I (Major)',
      costImpact: '$18,500 prototype tooling',
      scheduleImpact: '2 weeks re-winding and re-test',
      impacts: {
        create: [
          {
            objectType: 'Requirement',
            objectId: req2.id,
            title: req2.text,
            impactType: 'Direct Target',
            reason: 'Proposed redesign modifies torque delivery satisfying stroke transit time.',
          },
          {
            objectType: 'Architecture',
            objectId: sys2.id,
            title: sys2.name,
            impactType: 'Allocation Affected',
            reason: 'Brushless DC Motor internal stator coil rewound.',
          },
          {
            objectType: 'Verification',
            objectId: vrf2.id,
            title: vrf2.name,
            impactType: 'Invalidates Verification',
            reason: 'Requires mandatory re-execution on hydraulic dynamometer post-rework.',
            requiresRetest: true,
          },
          {
            objectType: 'Risk',
            objectId: 'RSK-001',
            title: 'Motor Thermal Overload',
            impactType: 'Re-opens Risk',
            reason: 'Increased current density requires updated thermal finite element analysis (FEA).',
          },
        ],
      },
    },
  });

  // 12. Create Functional Baseline
  await createProjectBaseline({
    projectId: project.id,
    name: 'Preliminary Design Review (PDR) Baseline',
    type: 'Functional',
    description: 'Initial requirements and system allocation baseline approved at PDR.',
    createdBy: adminUser.email,
  });

  // 13. Documents
  await prisma.documentRecord.create({
    data: {
      id: 'DOC-001',
      projectId: project.id,
      title: 'Actuator System Engineering Specification (ASES)',
      type: 'Specification',
      revision: 'A',
      status: 'Approved',
      fileName: 'DOC-001_ASES_RevA.pdf',
      fileSize: 320480,
      checksum: 'sha256-4a11f26e2e50d75a13328e3b48f95c25',
      authorId: engineer.email,
    },
  });

  await prisma.documentRecord.create({
    data: {
      id: 'DOC-002',
      projectId: project.id,
      title: 'Flange Mechanical Interface Control Document (ICD)',
      type: 'ICD',
      revision: 'B',
      status: 'In Review',
      fileName: 'DOC-002_Flange_ICD_RevB.pdf',
      fileSize: 184500,
      checksum: 'sha256-8b33a119c8f121e7894a7e937d12f341',
      authorId: engineer.email,
    },
  });

  // 14. Tasks
  await prisma.taskItem.create({
    data: {
      id: 'TSK-001',
      projectId: project.id,
      title: 'Execute thermal FEA analysis on rewound motor stator',
      description: 'Support ECR-001 and RSK-001 mitigation assessment under 5kN peak loading cycle.',
      sourceObjectType: 'EngineeringChangeRequest',
      sourceObjectId: ecr1.id,
      assigneeId: engineer.email,
      priority: 'High',
      status: 'In Progress',
      dueDate: new Date('2026-11-20'),
    },
  });

  await prisma.taskItem.create({
    data: {
      id: 'TSK-002',
      projectId: project.id,
      title: 'Review nonconformance NC-001 containment disposition',
      description: 'Quality board review of containment steps and quarantine validation.',
      sourceObjectType: 'Nonconformance',
      sourceObjectId: 'NC-001',
      assigneeId: qualityUser.email,
      priority: 'Critical',
      status: 'Open',
      dueDate: new Date('2026-10-30'),
    },
  });

  console.log('[Seed] Database seeded successfully with authentic connected engineering records!');
}

// If run directly via CLI:
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Error during seeding:', err);
      process.exit(1);
    });
}
