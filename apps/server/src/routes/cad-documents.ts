import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import type { CadDetail, CadDocument, Sketch } from '@sv/cad-core';
import { auth, type AuthContext } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { cadSourceSchema, solveCadSource } from '../services/cad-validation.js';
import { param } from './util.js';

// Experimental and disabled by default. Never trusts IDs without workspace and role checks.
export const cadDocumentsRouter=Router();
type Row={id:string; workspace_id:string; owner_id:string|null; name:string; head_revision:number; created_at:Date;updated_at:Date;archived_at:Date|null};
const revision=z.number().int().positive().max(2147483646);
const createInput=z.object({name:shortText(120).min(1),plane:z.literal('XY')}).strict();
const saveInput=z.object({expectedRevision:revision,name:shortText(120).min(1),source:cadSourceSchema}).strict();
const archiveInput=z.object({expectedRevision:revision}).strict();
function document(row:Row,a:AuthContext):CadDocument {return {id:row.id,workspaceId:row.workspace_id,ownerId:row.owner_id,name:row.name,headRevision:row.head_revision,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),archivedAt:row.archived_at?.toISOString()??null,canEdit:row.owner_id===a.userId||a.role==='owner'||a.role==='admin'};}
function assertEdit(row:Row,a:AuthContext){if(!document(row,a).canEdit)throw forbidden('Only the creator or workspace owner/admin can edit this sketch');}
async function getRow(executor:Db,a:AuthContext,id:string,lock=false):Promise<Row> {
 const r=await sql<Row>`SELECT id,workspace_id,owner_id,name,head_revision,created_at,updated_at,archived_at FROM cad_documents WHERE id=${id}::uuid AND workspace_id=${a.workspaceId}::uuid AND archived_at IS NULL ${lock?sql`FOR UPDATE`:sql``}`.execute(executor);
 if(!r.rows[0])throw notFound('Sketch');return r.rows[0];
}
async function detail(executor:Db,a:AuthContext,row:Row):Promise<CadDetail>{
 const r=await sql<{source:unknown}>`SELECT source FROM cad_document_revisions WHERE document_id=${row.id}::uuid AND revision=${row.head_revision}`.execute(executor);
 if(!r.rows[0])throw new Error('Sketch head revision missing');
 const parsed=cadSourceSchema.safeParse(r.rows[0].source);if(!parsed.success||parsed.data.id!==row.id||parsed.data.revision!==row.head_revision)throw new Error('Persisted sketch is invalid');
 const source=parsed.data as Sketch;
 // Reconstruct and validate numerical state on every reopen; never silently rewrite the stored source.
 try{solveCadSource(source)}catch{throw new Error('Persisted sketch cannot be reconstructed safely');}
 return {document:document(row,a),source};
}
cadDocumentsRouter.get('/',route(async(req,res)=>{
 const a=auth(req);const r=await sql<Row>`SELECT id,workspace_id,owner_id,name,head_revision,created_at,updated_at,archived_at FROM cad_documents WHERE workspace_id=${a.workspaceId}::uuid AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200`.execute(db);
 res.set('Cache-Control','no-store').json(r.rows.map(x=>document(x,a)));
}));
cadDocumentsRouter.get('/archived',route(async(req,res)=>{
 const a=auth(req);const r=await sql<Row>`SELECT id,workspace_id,owner_id,name,head_revision,created_at,updated_at,archived_at FROM cad_documents WHERE workspace_id=${a.workspaceId}::uuid AND archived_at IS NOT NULL ORDER BY updated_at DESC LIMIT 200`.execute(db);
 res.set('Cache-Control','no-store').json(r.rows.map(x=>document(x,a)));
}));
cadDocumentsRouter.post('/',route(async(req,res)=>{
 const a=auth(req),b=parse(createInput,req.body);
 const out=await db.transaction().execute(async trx=>{
  const r=await sql<{id:string}>`INSERT INTO cad_documents(workspace_id,owner_id,name) VALUES(${a.workspaceId}::uuid,${a.userId}::uuid,${b.name}) RETURNING id`.execute(trx);const id=r.rows[0].id;
  const source:Sketch={schemaVersion:1,id,plane:'XY',units:'m',revision:1,entities:[],constraints:[]};
  await sql`INSERT INTO cad_document_revisions(document_id,revision,source,author_id) VALUES(${id}::uuid,1,${JSON.stringify(source)}::jsonb,${a.userId}::uuid)`.execute(trx);
  return detail(trx,a,await getRow(trx,a,id));
 });res.status(201).json(out);
}));
cadDocumentsRouter.get('/:id',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id'));res.set('Cache-Control','no-store').json(await detail(db,a,await getRow(db,a,id)));
}));
cadDocumentsRouter.put('/:id',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id')),b=parse(saveInput,req.body);if(b.source.id!==id||b.source.revision!==b.expectedRevision)throw badRequest('Source ID and revision must match the document and expected revision');
 // Check read permission and editor role before running numerical work on untrusted input.
 assertEdit(await getRow(db,a,id),a);
 let solved:Sketch;try{solved=solveCadSource(b.source as Sketch)}catch(e){throw badRequest(e instanceof Error?e.message:'Sketch cannot be solved');}
 const out=await db.transaction().execute(async trx=>{
  const row=await getRow(trx,a,id,true);assertEdit(row,a);if(row.head_revision!==b.expectedRevision)throw conflict('Sketch changed in another session; keep your unsaved work and reload.');
  const current=await detail(trx,a,row);const existing=new Map(current.source.entities.map(e=>[e.id,e]));const now=new Date().toISOString();
  const source:Sketch={...solved,revision:row.head_revision+1,entities:solved.entities.map(e=>{const old=existing.get(e.id);if(old&&old.type!==e.type)throw badRequest('An entity ID cannot change type');return {...e,ownerId:old?.ownerId??a.userId,createdAt:old?.createdAt??now};})};
  await sql`INSERT INTO cad_document_revisions(document_id,revision,source,author_id) VALUES(${id}::uuid,${source.revision},${JSON.stringify(source)}::jsonb,${a.userId}::uuid)`.execute(trx);
  await sql`UPDATE cad_documents SET name=${b.name},head_revision=${source.revision},updated_at=now() WHERE id=${id}::uuid`.execute(trx);
  return detail(trx,a,await getRow(trx,a,id));
 });res.json(out);
}));
cadDocumentsRouter.post('/:id/archive',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id')),b=parse(archiveInput,req.body);
 await db.transaction().execute(async trx=>{const row=await getRow(trx,a,id,true);assertEdit(row,a);if(row.head_revision!==b.expectedRevision)throw conflict('Sketch changed in another session; reload before archiving.');await sql`UPDATE cad_documents SET archived_at=now(),updated_at=now() WHERE id=${id}::uuid`.execute(trx);});res.status(204).end();
}));

cadDocumentsRouter.post('/:id/unarchive',route(async(req,res)=>{
 const a=auth(req),id=parse(uuid,param(req,'id')),b=parse(archiveInput,req.body);
 const out=await db.transaction().execute(async trx=>{
  const found=await sql<Row>`SELECT id,workspace_id,owner_id,name,head_revision,created_at,updated_at,archived_at FROM cad_documents WHERE id=${id}::uuid AND workspace_id=${a.workspaceId}::uuid AND archived_at IS NOT NULL FOR UPDATE`.execute(trx);
  const row=found.rows[0];if(!row)throw notFound('Sketch');assertEdit(row,a);if(row.head_revision!==b.expectedRevision)throw conflict('Sketch revision changed; reload before restoring.');
  await sql`UPDATE cad_documents SET archived_at=NULL,updated_at=now() WHERE id=${id}::uuid`.execute(trx);return detail(trx,a,await getRow(trx,a,id));
 });res.json(out);
}));
