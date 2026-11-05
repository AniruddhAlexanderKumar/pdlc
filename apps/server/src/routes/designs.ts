import { Router } from 'express';
import { sql, type SqlBool } from 'kysely';
import { z } from 'zod';
import type { DesignDetail, DesignDocument, DiagramSource } from '@sv/shared';
import { auth, type AuthContext } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { diagramSourceSchema } from '../services/design-validation.js';
import { param } from './util.js';

export const designsRouter = Router();
type Row = { id:string; title:string; owner_id:string|null; owner_name:string|null; project_id:string|null; product_id:string|null; head_revision:number; created_at:Date; updated_at:Date };
function toDocument(row:Row, a:AuthContext):DesignDocument {
  return { id:row.id, title:row.title, kind:'diagram', ownerId:row.owner_id, ownerName:row.owner_name, projectId:row.project_id, productId:row.product_id, headRevision:row.head_revision, createdAt:row.created_at.toISOString(), updatedAt:row.updated_at.toISOString(), canEdit:row.owner_id===a.userId || a.role==='owner' || a.role==='admin' };
}
async function getDocument(executor:Db, a:AuthContext, id:string, lock=false) {
  const result=await sql<Row>`SELECT d.id,d.title,d.owner_id,u.name AS owner_name,d.project_id,d.product_id,d.head_revision,d.created_at,d.updated_at
    FROM design_documents d LEFT JOIN users u ON u.id=d.owner_id WHERE d.id=${id}::uuid AND d.workspace_id=${a.workspaceId}::uuid ${lock ? sql`FOR UPDATE OF d` : sql``}`.execute(executor);
  if (!result.rows[0]) throw notFound('Design');
  return result.rows[0];
}
async function detail(executor:Db, a:AuthContext, row:Row):Promise<DesignDetail> {
  const revision=await sql<{source:DiagramSource}>`SELECT source FROM design_revisions WHERE document_id=${row.id}::uuid AND revision=${row.head_revision}`.execute(executor);
  if (!revision.rows[0]) throw new Error('Design head revision missing');
  return {document:toDocument(row,a),source:revision.rows[0].source};
}
function assertEdit(row:Row,a:AuthContext) { if (!toDocument(row,a).canEdit) throw forbidden('Only the creator or a workspace owner/admin can edit this design'); }
const createInput=z.object({title:shortText(120).min(1),projectId:uuid.nullable(),productId:uuid.nullable()}).strict();
const saveInput=z.object({expectedRevision:z.number().int().positive(),summary:shortText(200).default(''),source:diagramSourceSchema}).strict();

designsRouter.get('/', route(async(req,res)=>{
 const a=auth(req);
 const rows=await sql<Row>`SELECT d.id,d.title,d.owner_id,u.name AS owner_name,d.project_id,d.product_id,d.head_revision,d.created_at,d.updated_at
 FROM design_documents d LEFT JOIN users u ON u.id=d.owner_id WHERE d.workspace_id=${a.workspaceId}::uuid ORDER BY d.updated_at DESC LIMIT 200`.execute(db);
 res.set('Cache-Control','no-store').json(rows.rows.map(r=>toDocument(r,a)));
}));
designsRouter.post('/',route(async(req,res)=>{
 const a=auth(req), b=parse(createInput,req.body);
 const result=await db.transaction().execute(async trx=>{
  if(b.projectId){const r=await sql<{exists:SqlBool}>`SELECT EXISTS(SELECT 1 FROM projects WHERE id=${b.projectId}::uuid AND workspace_id=${a.workspaceId}::uuid) AS exists`.execute(trx);if(!r.rows[0].exists)throw badRequest('Project must belong to this workspace');}
  if(b.productId){const r=await sql<{exists:SqlBool}>`SELECT EXISTS(SELECT 1 FROM products WHERE id=${b.productId}::uuid AND workspace_id=${a.workspaceId}::uuid) AS exists`.execute(trx);if(!r.rows[0].exists)throw badRequest('Product must belong to this workspace');}
  const inserted=await sql<{id:string}>`INSERT INTO design_documents(workspace_id,owner_id,project_id,product_id,title,kind) VALUES(${a.workspaceId}::uuid,${a.userId}::uuid,${b.projectId}::uuid,${b.productId}::uuid,${b.title},'diagram') RETURNING id`.execute(trx);
  const id=inserted.rows[0].id;
  await sql`INSERT INTO design_revisions(document_id,revision,source,author_id,summary) VALUES(${id}::uuid,1,${JSON.stringify({schemaVersion:1,nodes:[],edges:[]})}::jsonb,${a.userId}::uuid,'Created')`.execute(trx);
  return detail(trx,a,await getDocument(trx,a,id));
 });res.status(201).json(result);
}));
designsRouter.get('/:id',route(async(req,res)=>{const a=auth(req),id=parse(uuid,param(req,'id'));res.set('Cache-Control','no-store').json(await detail(db,a,await getDocument(db,a,id)));}));
designsRouter.get('/:id/revisions',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id'));await getDocument(db,a,id);
 const r=await sql<{revision:number;summary:string;author_name:string|null;created_at:Date}>`SELECT r.revision,r.summary,u.name AS author_name,r.created_at FROM design_revisions r LEFT JOIN users u ON u.id=r.author_id WHERE r.document_id=${id}::uuid ORDER BY r.revision DESC LIMIT 200`.execute(db);
 res.set('Cache-Control','no-store').json(r.rows.map(x=>({revision:x.revision,summary:x.summary,authorName:x.author_name,createdAt:x.created_at.toISOString()})));
}));
designsRouter.put('/:id',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id')),b=parse(saveInput,req.body);
 const out=await db.transaction().execute(async trx=>{
  const row=await getDocument(trx,a,id,true);assertEdit(row,a);if(row.head_revision!==b.expectedRevision)throw conflict('This design changed in another session. Your unsaved changes are still in this tab; copy them before reloading.');
  const next=row.head_revision+1;
  await sql`INSERT INTO design_revisions(document_id,revision,source,author_id,summary) VALUES(${id}::uuid,${next},${JSON.stringify(b.source)}::jsonb,${a.userId}::uuid,${b.summary})`.execute(trx);
  await sql`UPDATE design_documents SET head_revision=${next},updated_at=now() WHERE id=${id}::uuid`.execute(trx);
  return detail(trx,a,await getDocument(trx,a,id));
 });res.json(out);
}));
designsRouter.post('/:id/revisions/:revision/restore',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id')), revision=parse(z.coerce.number().int().positive(),param(req,'revision'));
 const b=parse(z.object({expectedRevision:z.number().int().positive()}).strict(),req.body);
 const out=await db.transaction().execute(async trx=>{
  const row=await getDocument(trx,a,id,true);assertEdit(row,a);if(row.head_revision!==b.expectedRevision)throw conflict('This design changed in another session. Reload before restoring.');
  const old=await sql<{source:unknown}>`SELECT source FROM design_revisions WHERE document_id=${id}::uuid AND revision=${revision}`.execute(trx);if(!old.rows[0])throw notFound('Revision');
  const source=parse(diagramSourceSchema,old.rows[0].source),next=row.head_revision+1;
  await sql`INSERT INTO design_revisions(document_id,revision,source,author_id,summary) VALUES(${id}::uuid,${next},${JSON.stringify(source)}::jsonb,${a.userId}::uuid,${`Restored revision ${revision}`})`.execute(trx);
  await sql`UPDATE design_documents SET head_revision=${next},updated_at=now() WHERE id=${id}::uuid`.execute(trx);
  return detail(trx,a,await getDocument(trx,a,id));
 });res.json(out);
}));
