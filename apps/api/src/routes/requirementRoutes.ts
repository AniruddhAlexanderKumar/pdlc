import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { analyzeRequirementQuality } from '../engines/qualityEngine.js';

const router = Router();

// GET requirements
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, status, type } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);
    if (status) where.status = String(status);
    if (type) where.type = String(type);

    const requirements = await prisma.requirement.findMany({
      where,
      include: {
        architecture: true,
        verificationProcs: true,
        risks: true,
      },
      orderBy: { id: 'asc' },
    });

    res.json(requirements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET requirement by ID with traceability and quality check
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const reqItem = await prisma.requirement.findUnique({
      where: { id },
      include: {
        architecture: true,
        verificationProcs: {
          include: {
            executions: {
              orderBy: { executedAt: 'desc' },
              take: 5,
            },
          },
        },
        risks: true,
        children: true,
        parent: true,
      },
    });

    if (!reqItem) {
      return res.status(404).json({ error: `Requirement ${id} not found.` });
    }

    const qualityChecks = analyzeRequirementQuality({
      text: reqItem.text,
      rationale: reqItem.rationale,
      allocatedTo: reqItem.allocatedTo,
      verificationMethod: reqItem.verificationMethod,
    });

    res.json({
      ...reqItem,
      qualityChecks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE requirement
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      title: z.string().optional(),
      text: z.string().min(5),
      rationale: z.string().optional(),
      type: z.string().default('Functional'),
      allocatedTo: z.string().nullable().optional(),
      verificationMethod: z.string().default('Test'),
      priority: z.string().default('Medium'),
    });

    const data = schema.parse(req.body);

    // Auto-generate ID if not provided: REQ-xxx
    let id = data.id;
    if (!id) {
      const count = await prisma.requirement.count({ where: { projectId: data.projectId } });
      id = `REQ-${String(count + 1).padStart(3, '0')}`;
    }

    const newReq = await prisma.requirement.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title || '',
        text: data.text,
        rationale: data.rationale || '',
        type: data.type,
        status: 'Draft',
        allocatedTo: data.allocatedTo || null,
        verificationMethod: data.verificationMethod,
        priority: data.priority,
        revision: 1,
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'REQUIREMENT_CREATED',
      objectType: 'Requirement',
      objectId: newReq.id,
      details: { text: newReq.text, type: newReq.type },
    });

    res.status(201).json(newReq);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE requirement
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.requirement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Requirement not found.' });

    const schema = z.object({
      title: z.string().optional(),
      text: z.string().min(5).optional(),
      rationale: z.string().optional(),
      type: z.string().optional(),
      allocatedTo: z.string().nullable().optional(),
      verificationMethod: z.string().optional(),
      priority: z.string().optional(),
      status: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // If requirement was Baselined, editing increments revision and marks In Review unless ECR
    let revision = existing.revision;
    if (existing.status === 'Baselined' && data.text && data.text !== existing.text) {
      revision += 1;
    }

    const updated = await prisma.requirement.update({
      where: { id },
      data: {
        ...data,
        revision,
      },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'REQUIREMENT_UPDATED',
      objectType: 'Requirement',
      objectId: id,
      details: { before: existing, after: updated },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// TRANSITION status
router.post('/:id/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['Draft', 'In Review', 'Approved', 'Baselined', 'Superseded', 'Rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const existing = await prisma.requirement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Requirement not found.' });

    const updated = await prisma.requirement.update({
      where: { id },
      data: { status },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: `REQUIREMENT_STATUS_${status.toUpperCase()}`,
      objectType: 'Requirement',
      objectId: id,
      details: { from: existing.status, to: status },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ADVISORY quality check
router.post('/:id/quality-check', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.requirement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Requirement not found.' });

    const qualityChecks = analyzeRequirementQuality({
      text: existing.text,
      rationale: existing.rationale,
      allocatedTo: existing.allocatedTo,
      verificationMethod: existing.verificationMethod,
    });

    res.json({ id, qualityChecks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
