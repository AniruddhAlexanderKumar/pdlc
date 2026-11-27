import { createHash } from 'node:crypto';
import { Router, raw } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { requireActivityOfProject, requireProject } from '../services/journey-first.js';
import { journeyReleaseContents, listJourneyDesigns, listJourneyRecords } from '../services/journey-records.js';
import { param } from './util.js';

export const journeyRecordsRouter = Router();
const base = '/projects/:projectId/records';
const label = shortText(200).min(1);
const details = shortText(4000);
const recordInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), text: details.min(1) }),
  z.object({ kind: z.literal('requirement'), label, state: z.enum(['To do','In progress','Done']) }),
  z.object({ kind: z.literal('part'), label, quantity: z.number().positive().max(1e9), text: details }),
  z.object({ kind: z.literal('test'), label, text: details.min(1), fix: details, fixed: z.boolean() }),
  z.object({ kind: z.literal('change'), label, text: details.min(1) }),
  z.object({ kind: z.enum(['diagram','sketch','model']), designId: uuid }),
]);

journeyRecordsRouter.get(base, route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  res.json({ records: await listJourneyRecords(project.id), designs: await listJourneyDesigns(project.id, actor.workspaceId) });
}));

journeyRecordsRouter.post(base, route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const { activityId, recordId } = parse(z.object({ activityId: uuid, recordId: uuid.optional() }), req.body);
  await requireActivityOfProject(activityId, project.id);
  const data = parse(recordInput, req.body);
  let name = 'Step notes';
  if ('label' in data) name = data.label;
  if ('designId' in data) {
    const design = (await listJourneyDesigns(project.id, actor.workspaceId))
      .find(item => item.id === data.designId && item.kind === data.kind);
    if (!design) throw notFound('Design');
    name = design.id;
  }
  if (recordId) {
    const updated = await sql`
      UPDATE journey_records SET label=${name}, data=${JSON.stringify(data)}::jsonb, updated_at=now()
      WHERE id=${recordId}::uuid AND project_id=${project.id}::uuid AND activity_id=${activityId}::uuid AND kind=${data.kind}
      RETURNING id
    `.execute(db);
    if (!updated.rows.length) throw notFound('Record');
  } else {
    await sql`
      INSERT INTO journey_records (project_id, activity_id, kind, label, data)
      VALUES (${project.id}::uuid,${activityId}::uuid,${data.kind},${name},${JSON.stringify(data)}::jsonb)
      ON CONFLICT (activity_id, kind, label) DO UPDATE SET data=excluded.data, updated_at=now()
    `.execute(db);
  }
  res.status(201).json({ ok: true });
}));

journeyRecordsRouter.get(base + '/release-preview', route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const snapshot = await journeyReleaseContents(project.id, actor.workspaceId);
  res.json({ ...snapshot, designs: snapshot.designs.map(({ source, ...design }) => design), token: stableSnapshot(snapshot) });
}));

journeyRecordsRouter.post(base + '/release', route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const body = parse(z.object({ activityId: uuid, label, snapshot: z.string().length(64) }), req.body);
  const activity = await requireActivityOfProject(body.activityId, project.id);
  if (activity.kind !== 'milestone') throw badRequest('Choose a release milestone');
  await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const waiting = await trx.selectFrom('journey_dependencies as d')
      .innerJoin('journey_activities as a', 'a.id', 'd.depends_on_id')
      .where('d.activity_id', '=', activity.id).where('a.status', '!=', 'completed')
      .select('a.title').executeTakeFirst();
    if (activity.status === 'blocked') throw badRequest('Clear the blocker before saving a release');
    if (waiting) throw badRequest(`Finish "${waiting.title}" before saving the release`);
    const pending = await trx.selectFrom('journey_activities as a')
      .innerJoin('journey_stages as s', 's.id', 'a.stage_id')
      .where('a.project_id', '=', project.id).where('a.kind', '=', 'approval')
      .where('a.status', '!=', 'completed')
      .where('s.position', '<=', db.selectFrom('journey_stages').select('position').where('id', '=', activity.stage_id))
      .select('a.id').executeTakeFirst();
    if (pending) throw badRequest('Complete the required reviews before saving a release');
    const snapshot = await journeyReleaseContents(project.id, actor.workspaceId, trx);
    if (!snapshot.records.length && !snapshot.designs.length) throw badRequest('Add a design, file, part, or test before saving a release');
    if (body.snapshot !== stableSnapshot(snapshot)) throw badRequest('Project work changed. Review the updated release before saving.');
    const inserted = await sql`
      INSERT INTO journey_records (project_id, activity_id, kind, label, data)
      VALUES (${project.id}::uuid,${activity.id}::uuid,'release',${body.label},${JSON.stringify(snapshot)}::jsonb)
      ON CONFLICT DO NOTHING RETURNING id
    `.execute(trx);
    if (!inserted.rows.length) throw badRequest('A release with that name already exists on this step');
  });
  res.status(201).json({ ok: true });
}));

function stableSnapshot(snapshot: unknown) {
  // The snapshot comes from JSONB, whose key order is consistent across reads.
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

journeyRecordsRouter.post(base + '/files/:activityId', raw({ type: 'application/octet-stream', limit: '10mb', inflate: false }), route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const activity = await requireActivityOfProject(parse(uuid, param(req, 'activityId')), project.id);
  const query = parse(z.object({ filename: label, recordId: uuid.optional() }), req.query);
  if (/[\x00-\x1f\x7f]/.test(query.filename)) throw badRequest('Choose a file with a valid name');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose a non-empty file');
  await db.transaction().execute(async trx => {
    const record = query.recordId
      ? await sql<{ id: string }>`SELECT id FROM journey_records WHERE id=${query.recordId}::uuid
          AND project_id=${project.id}::uuid AND activity_id=${activity.id}::uuid AND kind='file' FOR UPDATE`.execute(trx)
      : await sql<{ id: string }>`INSERT INTO journey_records (project_id,activity_id,kind,label)
          VALUES (${project.id}::uuid,${activity.id}::uuid,'file',${query.filename})
          ON CONFLICT (activity_id,kind,label) DO UPDATE SET updated_at=now() RETURNING id`.execute(trx);
    if (!record.rows[0]) throw notFound('File');
    await sql`INSERT INTO journey_file_versions (record_id,filename,bytes)
      VALUES (${record.rows[0].id}::uuid,${query.filename},${req.body})`.execute(trx);
  });
  res.status(201).json({ ok: true });
}));

journeyRecordsRouter.get(base + '/files/:versionId', route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const versionId = parse(uuid, param(req, 'versionId'));
  const result = await sql<{ bytes: Buffer; filename: string }>`
    SELECT v.bytes, v.filename FROM journey_file_versions v JOIN journey_records r ON r.id=v.record_id
    WHERE v.id=${versionId}::uuid AND r.project_id=${project.id}::uuid
  `.execute(db);
  const file = result.rows[0];
  if (!file) throw notFound('File version');
  res.attachment(file.filename).type('application/octet-stream').send(file.bytes);
}));

journeyRecordsRouter.get(base + '/release/:recordId', route(async (req, res) => {
  const actor = auth(req);
  const project = await requireProject(actor.workspaceId, parse(uuid, param(req, 'projectId')));
  const id = parse(uuid, param(req, 'recordId'));
  const result = await sql<{data: unknown}>`SELECT data FROM journey_records
    WHERE project_id=${project.id}::uuid AND id=${id}::uuid AND kind='release'`.execute(db);
  if (!result.rows.length) throw notFound('Release');
  res.attachment('release.json').json(result.rows[0].data);
}));
