import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { createProjectBaseline, compareBaselines } from '../engines/baselineEngine.js';

const router = Router();

// GET baselines
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const baselines = await prisma.baseline.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(baselines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single baseline
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const baseline = await prisma.baseline.findUnique({ where: { id } });
    if (!baseline) return res.status(404).json({ error: 'Baseline not found.' });
    res.json(baseline);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE baseline snapshot
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      projectId: z.string(),
      name: z.string().min(2),
      type: z.enum(['Functional', 'Allocated', 'Product', 'Release']).default('Functional'),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = req.user!;

    const baseline = await createProjectBaseline({
      projectId: data.projectId,
      name: data.name,
      type: data.type,
      description: data.description,
      createdBy: user.email,
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: user.email,
      action: 'BASELINE_ESTABLISHED',
      objectType: 'Baseline',
      objectId: baseline.id,
      details: { name: baseline.name, type: baseline.type },
    });

    res.status(201).json(baseline);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// COMPARE two baselines
router.post('/compare', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { baselineIdA, baselineIdB } = req.body;
    if (!baselineIdA || !baselineIdB) {
      return res.status(400).json({ error: 'Both baselineIdA and baselineIdB are required.' });
    }

    const [bA, bB] = await Promise.all([
      prisma.baseline.findUnique({ where: { id: baselineIdA } }),
      prisma.baseline.findUnique({ where: { id: baselineIdB } }),
    ]);

    if (!bA || !bB) {
      return res.status(404).json({ error: 'One or both baselines not found.' });
    }

    const diff = compareBaselines(bA, bB);
    res.json(diff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
