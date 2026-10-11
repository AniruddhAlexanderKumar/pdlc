import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET tasks
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const tasks = await prisma.taskItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE task
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      title: z.string().min(3),
      description: z.string().optional(),
      sourceObjectType: z.string().optional(),
      sourceObjectId: z.string().optional(),
      assigneeId: z.string().optional(),
      priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
      dueDate: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const count = await prisma.taskItem.count({ where: { projectId: data.projectId } });
    const id = data.id || `TSK-${String(count + 1).padStart(3, '0')}`;

    const task = await prisma.taskItem.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title,
        description: data.description || '',
        sourceObjectType: data.sourceObjectType || '',
        sourceObjectId: data.sourceObjectId || '',
        assigneeId: data.assigneeId || req.user!.email,
        priority: data.priority,
        status: 'Open',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'TASK_CREATED',
      objectType: 'TaskItem',
      objectId: task.id,
      details: { title: task.title, priority: task.priority },
    });

    res.status(201).json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE task
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['Open', 'In Progress', 'Completed']).optional(),
      priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
      assigneeId: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const updated = await prisma.taskItem.update({
      where: { id },
      data,
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'TASK_UPDATED',
      objectType: 'TaskItem',
      objectId: id,
      details: data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
