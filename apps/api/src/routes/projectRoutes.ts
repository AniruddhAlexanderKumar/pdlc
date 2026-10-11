import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { evaluateGateReadiness } from '../engines/gateEngine.js';

const router = Router();

// GET all projects
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            requirements: true,
            architecture: true,
            verificationProcs: true,
            risks: true,
            nonconformances: true,
          },
        },
      },
    });
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET project telemetry & health dashboard metrics
router.get('/:id/telemetry', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: `Project ${id} not found.` });
    }

    const [requirements, verificationProcs, risks, nonconformances, changeRequests] = await Promise.all([
      prisma.requirement.findMany({ where: { projectId: id } }),
      prisma.verificationProcedure.findMany({ where: { projectId: id } }),
      prisma.risk.findMany({ where: { projectId: id } }),
      prisma.nonconformance.findMany({ where: { projectId: id } }),
      prisma.engineeringChangeRequest.findMany({ where: { projectId: id } }),
    ]);

    const totalReqs = requirements.length;
    const allocatedReqs = requirements.filter((r) => !!r.allocatedTo).length;
    const baselinedReqs = requirements.filter((r) => r.status === 'Baselined').length;

    const totalTests = verificationProcs.length;
    const passedTests = verificationProcs.filter((v) => v.status === 'Passed').length;
    const failedTests = verificationProcs.filter((v) => v.status === 'Failed').length;

    const highRisks = risks.filter((r) => (r.severity === 'High' || r.severity === 'Critical') && r.status === 'Open').length;
    const openNCs = nonconformances.filter((n) => n.status !== 'Closed').length;
    const openECRs = changeRequests.filter((e) => e.status !== 'Closed' && e.status !== 'Rejected').length;

    const gateEvaluation = await evaluateGateReadiness(id);

    const telemetry = {
      project,
      totalReqs,
      allocatedReqs,
      baselinedReqs,
      totalTests,
      passedTests,
      failedTests,
      highRisks,
      openNCs,
      openECRs,
      isReleaseReady: gateEvaluation.isReady,
      blockersCount: gateEvaluation.blockersCount,
      criteria: gateEvaluation.criteria,
    };

    res.json(telemetry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single project
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        opportunities: true,
        baselines: true,
        releases: true,
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE project
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().min(2),
      name: z.string().min(3),
      description: z.string().optional(),
      phase: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const user = req.user!;
    const project = await prisma.project.create({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        phase: data.phase || 'Detailed Design',
        organizationId: user.organizationId,
        ownerId: user.id,
      },
    });

    await logAuditEvent({
      projectId: project.id,
      actorEmail: user.email,
      action: 'PROJECT_CREATED',
      objectType: 'Project',
      objectId: project.id,
      details: { name: project.name },
    });

    res.status(201).json(project);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
