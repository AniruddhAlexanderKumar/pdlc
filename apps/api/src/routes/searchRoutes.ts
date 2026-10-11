import { Router, Response } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = Router();

// GET global search
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;

    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    const [reqs, arch, procs, risks, ncs, ecrs] = await Promise.all([
      prisma.requirement.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { text: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      prisma.architectureElement.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      prisma.verificationProcedure.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      prisma.risk.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      prisma.nonconformance.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      prisma.engineeringChangeRequest.findMany({
        where: {
          projectId,
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    ]);

    const results = [
      ...reqs.map((r) => ({ type: 'Requirement', id: r.id, title: r.text, status: r.status, link: 'reqs' })),
      ...arch.map((a) => ({ type: 'Architecture', id: a.id, title: a.name, status: a.type, link: 'arch' })),
      ...procs.map((p) => ({ type: 'Verification', id: p.id, title: p.name, status: p.status, link: 'verify' })),
      ...risks.map((rk) => ({ type: 'Risk', id: rk.id, title: rk.title, status: rk.severity, link: 'risk' })),
      ...ncs.map((nc) => ({ type: 'Nonconformance', id: nc.id, title: nc.title, status: nc.status, link: 'quality' })),
      ...ecrs.map((e) => ({ type: 'Change Request', id: e.id, title: e.title, status: e.status, link: 'change' })),
    ];

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
