import { prisma } from './db.js';

export interface AuditParams {
  projectId?: string;
  actorEmail: string;
  action: string;
  objectType: string;
  objectId: string;
  details?: Record<string, any> | string;
}

export async function logAuditEvent({
  projectId,
  actorEmail,
  action,
  objectType,
  objectId,
  details,
}: AuditParams) {
  try {
    const detailsString = typeof details === 'object' ? JSON.stringify(details) : details;
    await prisma.auditEvent.create({
      data: {
        projectId: projectId || null,
        actorEmail,
        action,
        objectType,
        objectId,
        details: detailsString,
      },
    });
  } catch (error) {
    console.error('[Audit] Failed to record audit log:', error);
  }
}
