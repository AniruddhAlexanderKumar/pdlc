import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = Router();

// GET audit log events
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, limit } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit ? parseInt(String(limit), 10) : 50,
    });

    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
