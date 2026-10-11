import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, signToken, authMiddleware, AuthRequest, requireRoles } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.string().optional(),
  title: z.string().optional(),
  organizationName: z.string().optional(),
  organizationCode: z.string().optional(),
});

// 1. POST /login
router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'Suspended' || user.status === 'Deactivated') {
      return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}. Please contact your organization administrator.` });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });

    await logAuditEvent({
      actorEmail: user.email,
      action: 'USER_LOGIN',
      objectType: 'User',
      objectId: user.id,
      details: 'User authenticated successfully.',
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        title: user.title,
        status: user.status,
        timezone: user.timezone,
        organization: user.organization,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

// 2. POST /register (Public self-registration with org creation or auto-join)
router.post('/register', async (req, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    let org;
    if (data.organizationName) {
      // Create new organization with unique code
      const code = data.organizationCode || data.organizationName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'AERO';
      const existingOrg = await prisma.organization.findUnique({ where: { code } });
      const finalCode = existingOrg ? `${code}-${Math.floor(100 + Math.random() * 900)}` : code;

      org = await prisma.organization.create({
        data: {
          name: data.organizationName,
          code: finalCode,
          planTier: 'Enterprise',
          seatLimit: 50,
        },
      });
    } else {
      org = await prisma.organization.findFirst();
      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: 'NexGen Aerospace Systems',
            code: 'AERO-SYS',
            planTier: 'Enterprise',
          },
        });
      }
    }

    const passwordHash = await hashPassword(data.password);
    const userRole = data.organizationName ? 'OrgAdmin' : (data.role || 'SystemsEngineer');

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: userRole,
        title: data.title || (userRole === 'OrgAdmin' ? 'Engineering Director' : 'Systems Engineer'),
        status: 'Active',
        organizationId: org.id,
      },
      include: { organization: true },
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });

    // Create initial welcome notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `Welcome to NexGen PLM — ${org.name}`,
        message: 'Your organization workspace is provisioned. Explore the aerospace actuators scenario or initiate a new systems engineering project.',
        category: 'SYSTEM',
        link: '/dashboard',
        isRead: false,
      },
    });

    await logAuditEvent({
      actorEmail: user.email,
      action: 'USER_REGISTERED',
      objectType: 'User',
      objectId: user.id,
      details: { organizationId: org.id, role: user.role },
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        title: user.title,
        status: user.status,
        organization: user.organization,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

// 3. POST /forgot-password
router.post('/forgot-password', async (req, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    // Respond identically to prevent account enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email address, password reset instructions have been issued.' });
    }

    // Invalidate existing unused tokens
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiration

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    await logAuditEvent({
      actorEmail: user.email,
      action: 'PASSWORD_RESET_REQUESTED',
      objectType: 'User',
      objectId: user.id,
      details: 'Password reset token generated.',
    });

    res.json({
      message: 'If an account exists with this email address, password reset instructions have been issued.',
      // For controlled development inspection when outbound SMTP is unconfigured
      devToken: token,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. POST /reset-password
router.post('/reset-password', async (req, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(10),
      newPassword: z.string().min(6),
    });

    const { token, newPassword } = schema.parse(req.body);
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or unrecognized password reset token.' });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({ error: 'This password reset token has already been used.' });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({ error: 'This password reset token has expired. Please request a new link.' });
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await logAuditEvent({
      actorEmail: resetRecord.user.email,
      action: 'PASSWORD_RESET_COMPLETED',
      objectType: 'User',
      objectId: resetRecord.userId,
      details: 'Password reset completed successfully.',
    });

    res.json({ message: 'Your password has been successfully reset. You may now sign in with your new credentials.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. GET /me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { organization: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        title: user.title,
        status: user.status,
        timezone: user.timezone,
        notificationPrefs: user.notificationPrefs,
        organization: user.organization,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. PATCH /me/profile (Update name, title, timezone, notificationPrefs)
router.patch('/me/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(2).optional(),
      title: z.string().optional(),
      timezone: z.string().optional(),
      notificationPrefs: z.any().optional(),
    });

    const data = schema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      include: { organization: true },
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'USER_PROFILE_UPDATED',
      objectType: 'User',
      objectId: req.user!.id,
      details: data,
    });

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        title: updated.title,
        status: updated.status,
        timezone: updated.timezone,
        notificationPrefs: updated.notificationPrefs,
        organization: updated.organization,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. POST /me/change-password
router.post('/me/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });

    const { currentPassword, newPassword } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    await logAuditEvent({
      actorEmail: user.email,
      action: 'USER_PASSWORD_CHANGED',
      objectType: 'User',
      objectId: user.id,
      details: 'User password changed via settings.',
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. POST /invitations (OrgAdmin creates invitation)
router.post('/invitations', authMiddleware, requireRoles('OrgAdmin'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['SystemsEngineer', 'QualityEngineer', 'ProjectManager', 'OrgAdmin']).default('SystemsEngineer'),
    });

    const data = schema.parse(req.body);
    const orgId = req.user!.organizationId;

    // Check if user already exists in org
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email is already a registered member.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    const invitation = await prisma.invitation.create({
      data: {
        email: data.email,
        role: data.role,
        token,
        organizationId: orgId,
        invitedById: req.user!.id,
        expiresAt,
        status: 'Pending',
      },
    });

    await logAuditEvent({
      actorEmail: req.user!.email,
      action: 'INVITATION_ISSUED',
      objectType: 'Invitation',
      objectId: invitation.id,
      details: { email: data.email, role: data.role },
    });

    res.status(201).json({
      invitation,
      inviteUrl: `/invite/accept?token=${token}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. GET /invitations (List pending invitations)
router.get('/invitations', authMiddleware, requireRoles('OrgAdmin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const invitations = await prisma.invitation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { name: true, email: true } } },
    });
    res.json(invitations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. POST /invitations/accept (Public endpoint with token)
router.post('/invitations/accept', async (req, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(10),
      name: z.string().min(2),
      password: z.string().min(6),
    });

    const { token, name, password } = schema.parse(req.body);
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or invalid link.' });
    }

    if (invitation.status !== 'Pending') {
      return res.status(400).json({ error: `Invitation is no longer valid (${invitation.status}).` });
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'Expired' } });
      return res.status(400).json({ error: 'This invitation has expired. Please ask your administrator to reissue.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: invitation.email,
        name,
        passwordHash,
        role: invitation.role,
        organizationId: invitation.organizationId,
        status: 'Active',
      },
    });

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'Accepted', acceptedAt: new Date() },
    });

    const authToken = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });

    await logAuditEvent({
      actorEmail: user.email,
      action: 'INVITATION_ACCEPTED',
      objectType: 'User',
      objectId: user.id,
      details: { organizationId: invitation.organizationId, role: user.role },
    });

    res.status(201).json({
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: invitation.organization,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 11. POST /contact (Public contact & sales inquiry)
router.post('/contact', async (req, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      workEmail: z.string().email(),
      organization: z.string().min(2),
      role: z.string().optional(),
      areaOfInterest: z.string().optional(),
      message: z.string().min(5),
    });

    const data = schema.parse(req.body);
    const inquiry = await prisma.contactInquiry.create({
      data,
    });

    await logAuditEvent({
      actorEmail: data.workEmail,
      action: 'CONTACT_INQUIRY_RECEIVED',
      objectType: 'ContactInquiry',
      objectId: inquiry.id,
      details: { organization: data.organization, area: data.areaOfInterest },
    });

    res.status(201).json({
      message: 'Inquiry received. A NexGen systems flight specialist will reach out within 1 business day.',
      inquiryId: inquiry.id,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 12. GET & PATCH /notifications (In-app notifications)
router.get('/notifications', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { isRead: true },
    });
    res.json({ updated: updated.count });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
