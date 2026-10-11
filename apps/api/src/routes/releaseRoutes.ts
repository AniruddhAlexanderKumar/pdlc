import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { evaluateGateReadiness } from '../engines/gateEngine.js';

const router = Router();

// GET releases for a project
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const releases = await prisma.releaseRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(releases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EVALUATE stage-gate / release readiness
router.get('/evaluate-readiness', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId is required.' });

    const evaluation = await evaluateGateReadiness(String(projectId));
    res.json(evaluation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE release candidate
router.post('/candidate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      projectId: z.string(),
      version: z.string().min(1), // e.g. "v1.0.0-RC1"
      name: z.string().min(3),
      baselineId: z.string().optional(),
      releaseNotes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const count = await prisma.releaseRecord.count({ where: { projectId: data.projectId } });
    const id = `REL-${String(count + 1).padStart(3, '0')}`;

    const release = await prisma.releaseRecord.create({
      data: {
        id,
        projectId: data.projectId,
        version: data.version,
        name: data.name,
        status: 'Draft',
        baselineId: data.baselineId || null,
        releaseNotes: data.releaseNotes || '',
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'RELEASE_CANDIDATE_CREATED',
      objectType: 'ReleaseRecord',
      objectId: release.id,
      details: { version: release.version },
    });

    res.status(201).json(release);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// EXECUTE formal release (strictly checks gate criteria!)
router.post('/:id/execute-release', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const release = await prisma.releaseRecord.findUnique({ where: { id } });
    if (!release) return res.status(404).json({ error: 'Release record not found.' });

    // Strict Gate Evaluation Enforcement
    const gateEval = await evaluateGateReadiness(release.projectId);
    if (!gateEval.isReady) {
      const blockerMessages = gateEval.criteria
        .filter((c) => c.isMandatory && c.status === 'Blocked')
        .map((c) => `${c.name}: ${c.details}`);

      return res.status(422).json({
        error: 'Release authorization DENIED: Mandatory lifecycle gate criteria are unfulfilled.',
        blockersCount: gateEval.blockersCount,
        blockers: blockerMessages,
        criteria: gateEval.criteria,
      });
    }

    // Freeze Release Manifest
    const [requirements, architecture, verificationProcs, risks] = await Promise.all([
      prisma.requirement.findMany({ where: { projectId: release.projectId } }),
      prisma.architectureElement.findMany({ where: { projectId: release.projectId } }),
      prisma.verificationProcedure.findMany({ where: { projectId: release.projectId } }),
      prisma.risk.findMany({ where: { projectId: release.projectId } }),
    ]);

    const manifestData = {
      releasedAt: new Date().toISOString(),
      releasedBy: req.user!.email,
      scope: {
        requirementsCount: requirements.length,
        architectureCount: architecture.length,
        verificationPassRate: '100%',
        risksAssessed: risks.length,
      },
      verificationProof: verificationProcs.map((v) => ({ id: v.id, name: v.name, status: v.status })),
    };

    const updated = await prisma.releaseRecord.update({
      where: { id },
      data: {
        status: 'Released',
        releasedBy: req.user!.email,
        releasedAt: new Date(),
        manifestData,
      },
    });

    await logAuditEvent({
      projectId: release.projectId,
      actorEmail: req.user!.email,
      action: 'RELEASE_EXECUTED_APPROVED',
      objectType: 'ReleaseRecord',
      objectId: id,
      details: { version: release.version, manifest: manifestData },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
