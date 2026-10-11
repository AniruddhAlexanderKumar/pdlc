import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

const SEVERITY_SCORES: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const LIKELIHOOD_SCORES: Record<string, number> = {
  Rare: 1,
  Unlikely: 2,
  Possible: 3,
  Likely: 4,
  'Almost Certain': 5,
};

// GET risks
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const risks = await prisma.risk.findMany({
      where,
      include: {
        requirement: true,
        architecture: true,
      },
      orderBy: [{ severity: 'desc' }, { id: 'asc' }],
    });

    res.json(risks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE risk
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      title: z.string().min(3),
      cause: z.string().optional(),
      consequence: z.string().optional(),
      severity: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
      likelihood: z.enum(['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']).default('Possible'),
      linkedReq: z.string().nullable().optional(),
      linkedSys: z.string().nullable().optional(),
      mitigation: z.string().optional(),
      mitigationOwner: z.string().optional(),
    });

    const data = schema.parse(req.body);

    let id = data.id;
    if (!id) {
      const count = await prisma.risk.count({ where: { projectId: data.projectId } });
      id = `RSK-${String(count + 1).padStart(3, '0')}`;
    }

    const ratingScore = (SEVERITY_SCORES[data.severity] || 2) * (LIKELIHOOD_SCORES[data.likelihood] || 3);

    const newRisk = await prisma.risk.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title,
        cause: data.cause || '',
        consequence: data.consequence || '',
        severity: data.severity,
        likelihood: data.likelihood,
        ratingScore,
        linkedReq: data.linkedReq || null,
        linkedSys: data.linkedSys || null,
        mitigation: data.mitigation || '',
        mitigationOwner: data.mitigationOwner || '',
        status: 'Open',
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'RISK_LOGGED',
      objectType: 'Risk',
      objectId: newRisk.id,
      details: { title: newRisk.title, severity: newRisk.severity },
    });

    res.status(201).json(newRisk);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE risk
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.risk.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Risk not found.' });

    const schema = z.object({
      title: z.string().optional(),
      cause: z.string().optional(),
      consequence: z.string().optional(),
      severity: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
      likelihood: z.enum(['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']).optional(),
      status: z.enum(['Open', 'Mitigated', 'Accepted', 'Closed']).optional(),
      mitigation: z.string().optional(),
      mitigationOwner: z.string().optional(),
      residualRisk: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
    });

    const data = schema.parse(req.body);
    const severity = data.severity || existing.severity;
    const likelihood = data.likelihood || existing.likelihood;
    const ratingScore = (SEVERITY_SCORES[severity] || 2) * (LIKELIHOOD_SCORES[likelihood] || 3);

    const updated = await prisma.risk.update({
      where: { id },
      data: {
        ...data,
        ratingScore,
      },
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'RISK_UPDATED',
      objectType: 'Risk',
      objectId: id,
      details: data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
