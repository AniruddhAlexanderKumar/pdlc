import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET nonconformances
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const ncs = await prisma.nonconformance.findMany({
      where,
      include: {
        verification: true,
        requirement: true,
      },
      orderBy: { id: 'asc' },
    });

    res.json(ncs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single nonconformance
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const nc = await prisma.nonconformance.findUnique({
      where: { id },
      include: {
        verification: true,
        requirement: true,
      },
    });

    if (!nc) return res.status(404).json({ error: 'Nonconformance record not found.' });
    res.json(nc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE nonconformance
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      title: z.string().min(3),
      description: z.string().min(5),
      severity: z.enum(['Minor', 'Major', 'Critical']).default('Major'),
      linkedVrf: z.string().nullable().optional(),
      linkedReq: z.string().nullable().optional(),
      containmentActions: z.string().optional(),
      rootCause: z.string().optional(),
      proposedDisposition: z.string().optional(),
      correctiveAction: z.string().optional(),
      assignedTo: z.string().optional(),
    });

    const data = schema.parse(req.body);

    let id = data.id;
    if (!id) {
      const count = await prisma.nonconformance.count({ where: { projectId: data.projectId } });
      id = `NC-${String(count + 1).padStart(3, '0')}`;
    }

    const newNc = await prisma.nonconformance.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        linkedVrf: data.linkedVrf || null,
        linkedReq: data.linkedReq || null,
        status: 'Investigation',
        containmentActions: data.containmentActions || '',
        rootCause: data.rootCause || '',
        proposedDisposition: data.proposedDisposition || '',
        correctiveAction: data.correctiveAction || '',
        reportedBy: req.user!.email,
        assignedTo: data.assignedTo || '',
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'NONCONFORMANCE_LOGGED',
      objectType: 'Nonconformance',
      objectId: newNc.id,
      details: { title: newNc.title, severity: newNc.severity },
    });

    res.status(201).json(newNc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE nonconformance (investigation, disposition, corrective action)
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      severity: z.enum(['Minor', 'Major', 'Critical']).optional(),
      status: z.enum(['Investigation', 'Disposition Review', 'Corrective Action', 'Effectiveness Verification', 'Closed']).optional(),
      containmentActions: z.string().optional(),
      rootCause: z.string().optional(),
      proposedDisposition: z.string().optional(),
      correctiveAction: z.string().optional(),
      closureEvidence: z.string().optional(),
      assignedTo: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const updated = await prisma.nonconformance.update({
      where: { id },
      data,
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'NONCONFORMANCE_UPDATED',
      objectType: 'Nonconformance',
      objectId: id,
      details: data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// CLOSE nonconformance with evidence validation
router.post('/:id/close', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { closureEvidence, correctiveAction } = req.body;

    if (!closureEvidence || closureEvidence.trim().length < 5) {
      return res.status(400).json({ error: 'Closure evidence is mandatory to close a nonconformance.' });
    }

    const updated = await prisma.nonconformance.update({
      where: { id },
      data: {
        status: 'Closed',
        closureEvidence,
        correctiveAction: correctiveAction || undefined,
      },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'NONCONFORMANCE_CLOSED',
      objectType: 'Nonconformance',
      objectId: id,
      details: { closureEvidence },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
