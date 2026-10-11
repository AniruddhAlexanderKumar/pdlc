import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// GET documents
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = String(projectId);

    const docs = await prisma.documentRecord.findMany({
      where,
      orderBy: { id: 'asc' },
    });

    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE document
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      projectId: z.string(),
      title: z.string().min(3),
      type: z.string().default('Specification'),
      revision: z.string().default('A'),
      fileName: z.string().optional(),
      fileSize: z.number().optional(),
      checksum: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = req.user!;

    let id = data.id;
    if (!id) {
      const count = await prisma.documentRecord.count({ where: { projectId: data.projectId } });
      id = `DOC-${String(count + 1).padStart(3, '0')}`;
    }

    const doc = await prisma.documentRecord.create({
      data: {
        id,
        projectId: data.projectId,
        title: data.title,
        type: data.type,
        revision: data.revision,
        status: 'Draft',
        fileName: data.fileName || `${id}_rev${data.revision}.pdf`,
        fileSize: data.fileSize || 1024 * 142, // default 142 KB
        checksum: data.checksum || 'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        authorId: user.email,
      },
    });

    await logAuditEvent({
      projectId: data.projectId,
      actorEmail: user.email,
      action: 'DOCUMENT_CREATED',
      objectType: 'DocumentRecord',
      objectId: doc.id,
      details: { title: doc.title, revision: doc.revision },
    });

    res.status(201).json(doc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE document
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      title: z.string().optional(),
      revision: z.string().optional(),
      status: z.enum(['Draft', 'In Review', 'Approved', 'Obsolete']).optional(),
    });

    const data = schema.parse(req.body);
    const updated = await prisma.documentRecord.update({
      where: { id },
      data,
    });

    await logAuditEvent({
      projectId: updated.projectId,
      actorEmail: req.user!.email,
      action: 'DOCUMENT_UPDATED',
      objectType: 'DocumentRecord',
      objectId: id,
      details: data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
