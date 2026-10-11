import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET verification procedures
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const procs = await prisma.verificationProcedure.findMany({
      where,
      include: {
        requirement: true,
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
    });

    res.json(procs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single verification procedure with full execution history
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const proc = await prisma.verificationProcedure.findUnique({
      where: { id },
      include: {
        requirement: true,
        executions: {
          orderBy: { executedAt: 'desc' },
        },
        nonconformances: true,
      },
    });

    if (!proc) return res.status(404).json({ error: 'Verification procedure not found.' });
    res.json(proc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE verification procedure
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      name: z.string().min(3),
      method: z.string().default('Test'),
      reqId: z.string(),
      archId: z.string().nullable().optional(),
      acceptanceCriteria: z.string().min(5),
    });

    const data = schema.parse(req.body);

    let id = data.id;
    if (!id) {
      const count = await prisma.verificationProcedure.count({ where: { projectId: data.projectId } });
      id = `VRF-${String(count + 1).padStart(3, '0')}`;
    }

    const newProc = await prisma.verificationProcedure.create({
      data: {
        id,
        projectId: data.projectId,
        name: data.name,
        method: data.method,
        reqId: data.reqId,
        archId: data.archId || null,
        acceptanceCriteria: data.acceptanceCriteria,
        status: 'Planned',
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: req.user!.email,
      action: 'VERIFICATION_PROCEDURE_CREATED',
      objectType: 'VerificationProcedure',
      objectId: newProc.id,
      details: { name: newProc.name, reqId: newProc.reqId },
    });

    res.status(201).json(newProc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// EXECUTE test procedure (Authoritative Execution Ledger)
router.post('/:id/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const proc = await prisma.verificationProcedure.findUnique({
      where: { id },
      include: { requirement: true },
    });

    if (!proc) return res.status(404).json({ error: 'Verification procedure not found.' });

    const schema = z.object({
      testConfiguration: z.string().min(3),
      executorId: z.string().optional(),
      witness: z.string().optional(),
      outcome: z.enum(['Passed', 'Failed', 'Inconclusive']),
      measurements: z.array(
        z.object({
          parameter: z.string(),
          expected: z.string(),
          actual: z.string(),
          unit: z.string(),
          pass: z.boolean(),
        })
      ).default([]),
      observations: z.string().min(3),
      deviations: z.string().optional(),
      evidenceNotes: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = req.user!;

    // Compute execution run number
    const executionCount = await prisma.verificationExecution.count({
      where: { procedureId: id },
    });
    const executionNumber = executionCount + 1;

    // 1. Record historical execution event
    const execution = await prisma.verificationExecution.create({
      data: {
        procedureId: id,
        executionNumber,
        testConfiguration: data.testConfiguration,
        executorId: data.executorId || user.email,
        witness: data.witness,
        outcome: data.outcome,
        measurements: data.measurements,
        observations: data.observations,
        deviations: data.deviations,
        evidenceNotes: data.evidenceNotes,
      },
    });

    // 2. Update current procedure status and latest summary
    const updatedProc = await prisma.verificationProcedure.update({
      where: { id },
      data: {
        status: data.outcome,
        resultSummary: data.observations,
      },
    });

    // 3. If test failed, automatically initiate or link Nonconformance
    let createdNC = null;
    if (data.outcome === 'Failed') {
      const ncCount = await prisma.nonconformance.count({ where: { projectId: proc.projectId } });
      const ncId = `NC-${String(ncCount + 1).padStart(3, '0')}`;

      createdNC = await prisma.nonconformance.create({
        data: {
          id: ncId,
          projectId: proc.projectId,
          title: `Verification Failure in ${proc.id}: ${proc.name}`,
          description: `Test execution #${executionNumber} FAILED: ${data.observations}. Deviations: ${data.deviations || 'None specified'}.`,
          severity: 'Major',
          linkedVrf: proc.id,
          linkedReq: proc.reqId,
          status: 'Investigation',
          containmentActions: 'Quarantine hardware unit and halt stage transition.',
          reportedBy: user.email,
        },
      });

      await logAuditEvent({
        projectId: proc.projectId,
        actorEmail: user.email,
        action: 'NONCONFORMANCE_AUTO_GENERATED',
        objectType: 'Nonconformance',
        objectId: ncId,
        details: { linkedVrf: proc.id, executionNumber },
      });
    }

    await logAuditEvent({
      projectId: proc.projectId,
      actorEmail: user.email,
      action: `VERIFICATION_EXECUTED_${data.outcome.toUpperCase()}`,
      objectType: 'VerificationProcedure',
      objectId: proc.id,
      details: {
        executionId: execution.id,
        executionNumber,
        outcome: data.outcome,
        observations: data.observations,
      },
    });

    res.json({
      procedure: updatedProc,
      execution,
      nonconformance: createdNC,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
