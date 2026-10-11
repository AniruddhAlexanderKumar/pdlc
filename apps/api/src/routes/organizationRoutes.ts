import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest, requireRoles } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// Commercial Tier Entitlements Matrix
export const PLAN_ENTITLEMENTS: Record<string, {
  name: string;
  maxProjects: number;
  maxSeats: number;
  canExportAudit: boolean;
  canExecuteRelease: boolean;
  canManageCCB: boolean;
  supportSla: string;
}> = {
  Starter: {
    name: 'Starter Engineering Tier',
    maxProjects: 3,
    maxSeats: 5,
    canExportAudit: false,
    canExecuteRelease: false,
    canManageCCB: true,
    supportSla: 'Standard (48h)',
  },
  Professional: {
    name: 'Professional Team Tier',
    maxProjects: 15,
    maxSeats: 25,
    canExportAudit: true,
    canExecuteRelease: true,
    canManageCCB: true,
    supportSla: 'Priority (12h)',
  },
  Enterprise: {
    name: 'Aerospace Mission-Critical Enterprise',
    maxProjects: 999,
    maxSeats: 500,
    canExportAudit: true,
    canExecuteRelease: true,
    canManageCCB: true,
    supportSla: 'Aerospace 24/7 Mission Support (1h)',
  },
};

// GET current organization & commercial subscription details
router.get('/current', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: { users: true, projects: true, supportTickets: true },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const entitlements = PLAN_ENTITLEMENTS[org.planTier] || PLAN_ENTITLEMENTS.Enterprise;

    res.json({
      organization: org,
      entitlements,
      plansAvailable: PLAN_ENTITLEMENTS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE commercial plan / subscription state (OrgAdmin only)
router.patch('/subscription', authMiddleware, requireRoles('OrgAdmin'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      planTier: z.enum(['Starter', 'Professional', 'Enterprise']).optional(),
      subscriptionStatus: z.enum(['Trial', 'Active', 'PastDue', 'Suspended']).optional(),
      seatLimit: z.number().int().min(1).optional(),
    });

    const data = schema.parse(req.body);
    const orgId = req.user!.organizationId;

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data,
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'ORGANIZATION_PLAN_UPDATED',
      objectType: 'Organization',
      objectId: orgId,
      details: {
        newPlan: data.planTier,
        newStatus: data.subscriptionStatus,
        newSeats: data.seatLimit,
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET organization team members
router.get('/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET support tickets for the organization
router.get('/support', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const tickets = await prisma.supportTicket.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE support ticket
router.post('/support', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      title: z.string().min(5),
      description: z.string().min(10),
      category: z.enum(['Access', 'Workflow Guidance', 'Compliance Audit', 'Bug Report']).default('Workflow Guidance'),
      severity: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
    });

    const data = schema.parse(req.body);
    const orgId = req.user!.organizationId;
    const count = await prisma.supportTicket.count();
    const id = `TKT-${String(count + 1).padStart(3, '0')}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        id,
        organizationId: orgId,
        title: data.title,
        description: data.description,
        category: data.category,
        severity: data.severity,
        reporterEmail: req.user!.email,
        status: 'Open',
      },
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'SUPPORT_TICKET_OPENED',
      objectType: 'SupportTicket',
      objectId: ticket.id,
      details: { title: ticket.title, severity: ticket.severity },
    });

    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
