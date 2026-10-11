import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { analyzeChangeImpact } from '../engines/impactEngine.js';

const router = Router();

// POST impact analysis preview
router.post('/impact-analysis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      projectId: z.string(),
      targetReqId: z.string().nullable().optional(),
      targetSysId: z.string().nullable().optional(),
    });

    const data = schema.parse(req.body);
    const analysis = await analyzeChangeImpact(data);

    res.json(analysis);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET all ECRs
router.get('/ecr', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const ecrs = await prisma.engineeringChangeRequest.findMany({
      where,
      include: {
        impacts: true,
        changeOrders: true,
        targetRequirement: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(ecrs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE ECR (generates change request with impacts)
router.post('/ecr', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      projectId: z.string(),
      title: z.string().min(3),
      reason: z.string().min(5),
      proposedModification: z.string().min(5),
      targetReqId: z.string().nullable().optional(),
      targetSysId: z.string().nullable().optional(),
      severity: z.string().default('Class I (Major)'),
      costImpact: z.string().optional(),
      scheduleImpact: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = req.user!;

    const count = await prisma.engineeringChangeRequest.count({ where: { projectId: data.projectId } });
    const id = `ECR-${String(count + 1).padStart(3, '0')}`;

    // Compute impacts automatically from the dependency graph
    const analysis = await analyzeChangeImpact({
      projectId: data.projectId,
      targetReqId: data.targetReqId,
      targetSysId: data.targetSysId,
    });

    const ecr = await prisma.engineeringChangeRequest.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title,
        reason: data.reason,
        proposedModification: data.proposedModification,
        targetReqId: data.targetReqId || null,
        originatorId: user.email,
        status: 'Submitted',
        severity: data.severity,
        costImpact: data.costImpact || '',
        scheduleImpact: data.scheduleImpact || '',
        impacts: {
          create: analysis.impacts.map((imp) => ({
            objectType: imp.objectType,
            objectId: imp.objectId,
            title: imp.title,
            impactType: imp.impactType,
            reason: imp.reason,
            requiresRetest: imp.requiresRetest || false,
          })),
        },
      },
      include: {
        impacts: true,
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: user.email,
      action: 'ECR_SUBMITTED',
      objectType: 'EngineeringChangeRequest',
      objectId: ecr.id,
      details: { title: ecr.title, impactsCount: analysis.impacts.length },
    });

    res.status(201).json(ecr);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// APPROVE ECR
router.post('/ecr/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const updated = await prisma.engineeringChangeRequest.update({
      where: { id },
      data: {
        status: 'Approved',
        approvedBy: user.email,
        approvedAt: new Date(),
      },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: user.email,
      action: 'ECR_APPROVED',
      objectType: 'EngineeringChangeRequest',
      objectId: id,
      details: { approvedBy: user.email },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// REJECT ECR
router.post('/ecr/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const updated = await prisma.engineeringChangeRequest.update({
      where: { id },
      data: {
        status: 'Rejected',
      },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: user.email,
      action: 'ECR_REJECTED',
      objectType: 'EngineeringChangeRequest',
      objectId: id,
      details: { rejectedBy: user.email },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PROMOTE ECR to ECO (Engineering Change Order)
router.post('/ecr/:id/promote-eco', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ecr = await prisma.engineeringChangeRequest.findUnique({ where: { id } });
    if (!ecr) return res.status(404).json({ error: 'ECR not found.' });
    if (ecr.status !== 'Approved') {
      return res.status(400).json({ error: 'Only Approved ECRs can be promoted to Engineering Change Orders.' });
    }

    const count = await prisma.engineeringChangeOrder.count({ where: { projectId: ecr.projectId } });
    const ecoId = `ECO-${String(count + 1).padStart(3, '0')}`;

    const eco = await prisma.engineeringChangeOrder.create({
      data: {
        id: ecoId,
        ecrId: ecr.id,
        projectId: ecr.projectId,
        title: `ECO for ${ecr.id}: ${ecr.title}`,
        authorizedScope: ecr.proposedModification,
        implementationInstructions: `Implement modification authorized under ${ecr.id}. Re-run invalidated verification procedures.`,
        status: 'In Progress',
        assignedTo: req.user!.email,
      },
    });

    await prisma.engineeringChangeRequest.update({
      where: { id },
      data: { status: 'Implemented' },
    });

    await logAuditEvent({
      projectId: ecr.projectId,
      actorEmail: req.user!.email,
      action: 'ECO_CREATED_FROM_ECR',
      objectType: 'EngineeringChangeOrder',
      objectId: eco.id,
      details: { ecrId: ecr.id },
    });

    res.status(201).json(eco);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET ECOs
router.get('/eco', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const ecos = await prisma.engineeringChangeOrder.findMany({
      where,
      include: { ecr: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(ecos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
