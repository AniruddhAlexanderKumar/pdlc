import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET opportunities
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const opps = await prisma.opportunity.findMany({
      orderBy: { createdAt: 'desc' },
      include: { project: true },
    });
    res.json(opps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE opportunity
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      title: z.string().min(3),
      problem: z.string().min(5),
      justification: z.string().optional(),
      targetDeliveryDate: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const count = await prisma.opportunity.count();
    const id = data.id || `OPP-${String(count + 1).padStart(3, '0')}`;

    const opp = await prisma.opportunity.create({
      data: {
        id,
        title: data.title,
        problem: data.problem,
        justification: data.justification || '',
        status: 'Draft',
        targetDeliveryDate: data.targetDeliveryDate ? new Date(data.targetDeliveryDate) : null,
      },
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'OPPORTUNITY_CREATED',
      objectType: 'Opportunity',
      objectId: opp.id,
      details: { title: opp.title },
    });

    res.status(201).json(opp);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// APPROVE opportunity
router.post('/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const opp = await prisma.opportunity.update({
      where: { id },
      data: { status: 'Approved' },
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'OPPORTUNITY_APPROVED',
      objectType: 'Opportunity',
      objectId: id,
    });

    res.json(opp);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// CONVERT opportunity into a Project (Section 6.3)
router.post('/:id/convert-to-project', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const opp = await prisma.opportunity.findUnique({ where: { id } });
    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
    if (opp.status !== 'Approved') {
      return res.status(400).json({ error: 'Opportunity must be Approved before converting to a formal project.' });
    }

    const schema = z.object({
      projectId: z.string().min(2),
      projectName: z.string().min(3),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = req.user!;

    // Create project
    const project = await prisma.project.create({
      data: {
        id: data.projectId,
        name: data.projectName,
        description: data.description || opp.problem,
        phase: 'Concept Development',
        organizationId: user.organizationId,
        ownerId: user.id,
      },
    });

    // Update opportunity status and link
    const updatedOpp = await prisma.opportunity.update({
      where: { id },
      data: {
        status: 'Converted',
        projectId: project.id,
      },
    });

    await logAuditEvent({
      projectId: project.id,
      actorEmail: user.email,
      action: 'OPPORTUNITY_CONVERTED_TO_PROJECT',
      objectType: 'Opportunity',
      objectId: id,
      details: { newProjectId: project.id },
    });

    res.status(201).json({ project, opportunity: updatedOpp });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
