import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET architecture elements
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const elements = await prisma.architectureElement.findMany({
      where,
      include: {
        allocatedReqs: {
          select: { id: true, text: true, type: true, status: true },
        },
        risks: {
          select: { id: true, title: true, severity: true, status: true },
        },
        children: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    res.json(elements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single architecture element
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const element = await prisma.architectureElement.findUnique({
      where: { id },
      include: {
        allocatedReqs: true,
        risks: true,
        children: true,
        parent: true,
      },
    });

    if (!element) return res.status(404).json({ error: 'Architecture element not found.' });
    res.json(element);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE architecture element
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      name: z.string().min(2),
      description: z.string().optional(),
      type: z.string().default('Component'),
      parentId: z.string().nullable().optional(),
    });

    const data = schema.parse(req.body);

    let id = data.id;
    if (!id) {
      const count = await prisma.architectureElement.count({ where: { projectId: data.projectId } });
      id = `SYS-${String(count + 1).padStart(3, '0')}`;
    }

    const newElement = await prisma.architectureElement.create({
      data: {
        id,
        projectId: data.projectId,
        name: data.name,
        description: data.description || '',
        type: data.type,
        parentId: data.parentId || null,
        revision: 1,
        status: 'Approved',
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'ARCHITECTURE_ELEMENT_CREATED',
      objectType: 'ArchitectureElement',
      objectId: newElement.id,
      details: { name: newElement.name, type: newElement.type },
    });

    res.status(201).json(newElement);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE architecture element
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      parentId: z.string().nullable().optional(),
      status: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const updated = await prisma.architectureElement.update({
      where: { id },
      data,
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'ARCHITECTURE_ELEMENT_UPDATED',
      objectType: 'ArchitectureElement',
      objectId: id,
      details: data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
