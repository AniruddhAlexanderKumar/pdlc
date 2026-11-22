import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sql } from 'kysely';
import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '@sv/shared';
import { auth, requireAdmin } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, HttpError, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { assistantProviderNames, generateAssistantReply } from '../services/assistant-ai.js';
import { journeyContextForProject } from '../services/journey-first.js';
import { param } from './util.js';

export const assistantRouter = Router();
export const assistantAdminRouter = Router();
assistantAdminRouter.use(requireAdmin);
const limiter=rateLimit({windowMs:60_000,limit:20,keyGenerator:req=>auth(req).userId,standardHeaders:'draft-8',legacyHeaders:false});
type Conversation={id:string;project_id:string|null;title:string;created_at:Date;updated_at:Date;project_name:string|null;project_key:string|null};
type Source={type:'project'|'issue'|'help';title:string;url:string;slug?:string;recordId?:string};
type Msg={id:string;role:'user'|'assistant';content:string;sources:Source[];created_at:Date};
type Action={id:string;kind:'create_project'|'create_issue'|'update_issue_status'|'update_issue_priority';payload:{name?:string;key?:string;summary?:string;projectId?:string;projectName?:string;issueId?:string;issueKey?:string;previousStatus?:string;nextStatus?:string;previousPriority?:string;nextPriority?:string};status:string;result:{url:string;label:string}|null;created_at:Date};
async function conversation(id:string,userId:string,workspaceId:string):Promise<Conversation>{
 const r=await sql<Conversation>`SELECT c.id,c.project_id,c.title,c.created_at,c.updated_at,p.name AS project_name,p.project_key FROM assistant_conversations c LEFT JOIN projects p ON p.id=c.project_id AND p.workspace_id=c.workspace_id WHERE c.id=${id}::uuid AND c.user_id=${userId}::uuid AND c.workspace_id=${workspaceId}::uuid`.execute(db);
 if(!r.rows[0])throw notFound('Conversation');return r.rows[0];
}
const convId=(req:import('express').Request)=>parse(uuid,param(req,'id'));
assistantRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
assistantRouter.get('/conversations',route(async(req,res)=>{const a=auth(req);const q=parse(z.object({q:shortText(100).optional()}),req.query);const query=`%${(q.q??'').replace(/[\\%_]/g,'\\$&')}%`;const r=await sql<Conversation>`SELECT c.id,c.project_id,c.title,c.created_at,c.updated_at,p.name AS project_name,p.project_key FROM assistant_conversations c LEFT JOIN projects p ON p.id=c.project_id AND p.workspace_id=c.workspace_id WHERE c.workspace_id=${a.workspaceId}::uuid AND c.user_id=${a.userId}::uuid AND (c.title ILIKE ${query} OR EXISTS (SELECT 1 FROM assistant_messages m WHERE m.conversation_id=c.id AND m.role='user' AND m.content ILIKE ${query})) ORDER BY c.updated_at DESC LIMIT 100`.execute(db);res.json(r.rows);}));
assistantRouter.post('/conversations',route(async(req,res)=>{const a=auth(req);const b=parse(z.object({projectId:uuid.nullable()}).strict(),req.body);if(b.projectId){const p=await db.selectFrom('projects').select('id').where('id','=',b.projectId).where('workspace_id','=',a.workspaceId).executeTakeFirst();if(!p)throw notFound('Project');}const r=await sql<{id:string}>`INSERT INTO assistant_conversations(workspace_id,user_id,project_id,title) VALUES(${a.workspaceId}::uuid,${a.userId}::uuid,${b.projectId}::uuid,'New conversation') RETURNING id`.execute(db);res.status(201).json(await conversation(r.rows[0].id,a.userId,a.workspaceId));}));
assistantRouter.get('/conversations/:id',route(async(req,res)=>{
 const a=auth(req), c=await conversation(convId(req),a.userId,a.workspaceId);
 const rows=await sql<Msg>`SELECT id,role,content,sources,created_at FROM assistant_messages WHERE conversation_id=${c.id}::uuid ORDER BY created_at,id LIMIT 500`.execute(db);
 const allowed=await db.selectFrom('help_articles').select(['slug','updated_at']).where('status','=','published').where('audience','in',a.role==='member'&&!a.isAdmin?['everyone']:['everyone','workspace_admin']).execute();const slugs=new Map(allowed.map(x=>[x.slug,x.updated_at]));
 const issueIds=[...new Set(rows.rows.flatMap(m=>m.sources.filter(s=>s.type==='issue'&&s.recordId).map(s=>s.recordId!)))];
 const accessibleIssues=issueIds.length?await db.selectFrom('issues as i').innerJoin('projects as p','p.id','i.project_id').select(['i.id','i.updated_at']).where('p.workspace_id','=',a.workspaceId).where('i.id','in',issueIds).execute():[];
 const issueDates=new Map(accessibleIssues.map(i=>[i.id,i.updated_at]));
 const projectIds=[...new Set(rows.rows.flatMap(m=>m.sources.filter(s=>s.type==='project'&&s.recordId).map(s=>s.recordId!)))];
 const accessibleProjects=projectIds.length?await db.selectFrom('projects').select(['id','updated_at']).where('workspace_id','=',a.workspaceId).where('id','in',projectIds).execute():[];
 const projectDates=new Map(accessibleProjects.map(p=>[p.id,p.updated_at]));
 const messages=rows.rows.map(m=>m.role==='assistant'&&m.sources.some(s=>{
  if(s.type==='help'){const changed=s.slug?slugs.get(s.slug):undefined;return !changed||changed.getTime()>m.created_at.getTime();}
  if(s.type==='issue'){const changed=s.recordId?issueDates.get(s.recordId):undefined;return !changed||changed.getTime()>m.created_at.getTime();}
  if(s.type==='project' && s.recordId){const changed=projectDates.get(s.recordId);return !changed||changed.getTime()>m.created_at.getTime();}
  return false;
 })?{...m,content:'This response referenced a source that is no longer available or has changed. Ask again for current information.',sources:[]}:{...m,sources:m.sources.map(({recordId:_recordId,slug:_slug,...source})=>source)});
 const actions=await sql<Action>`SELECT id,kind,payload,status,result,created_at FROM assistant_actions WHERE conversation_id=${c.id}::uuid AND user_id=${a.userId}::uuid AND workspace_id=${a.workspaceId}::uuid ORDER BY created_at`.execute(db);
 res.json({conversation:c,messages,actions:actions.rows.map(act=>{const {projectId:_projectId,issueId:_issueId,...payload}=act.payload;return {...act,payload};})});
}));
assistantRouter.patch('/conversations/:id',route(async(req,res)=>{const a=auth(req),id=convId(req),b=parse(z.object({title:shortText(100).min(1)}).strict(),req.body);await conversation(id,a.userId,a.workspaceId);await sql`UPDATE assistant_conversations SET title=${b.title},updated_at=now() WHERE id=${id}::uuid AND user_id=${a.userId}::uuid AND workspace_id=${a.workspaceId}::uuid`.execute(db);res.json({ok:true});}));
assistantRouter.delete('/conversations/:id',route(async(req,res)=>{const a=auth(req),id=convId(req);await conversation(id,a.userId,a.workspaceId);await db.transaction().execute(async trx=>{await sql`UPDATE assistant_actions SET status='cancelled' WHERE conversation_id=${id}::uuid AND status='pending'`.execute(trx);await sql`DELETE FROM assistant_conversations WHERE id=${id}::uuid AND user_id=${a.userId}::uuid AND workspace_id=${a.workspaceId}::uuid`.execute(trx);});res.status(204).end();}));
assistantRouter.delete('/conversations/:id/messages',route(async(req,res)=>{const a=auth(req),id=convId(req);await conversation(id,a.userId,a.workspaceId);await db.transaction().execute(async trx=>{await sql`UPDATE assistant_actions SET status='cancelled' WHERE conversation_id=${id}::uuid AND status='pending'`.execute(trx);await sql`DELETE FROM assistant_messages WHERE conversation_id=${id}::uuid`.execute(trx);});res.status(204).end();}));
assistantRouter.get('/usage',route(async(req,res)=>{
  const a=auth(req);
  const isAdmin=Boolean(a.isAdmin || a.role==='admin' || a.role==='owner');
  const countRes=await sql<{count:number}>`SELECT count(*)::int AS count FROM assistant_messages m JOIN assistant_conversations ac ON ac.id=m.conversation_id WHERE ac.user_id=${a.userId}::uuid AND m.role='user' AND m.created_at>=date_trunc('day',now())`.execute(db);
  const countToday=countRes.rows[0]?.count??0;
  const bal=await sql<{remaining_tokens:number}>`SELECT remaining_tokens FROM assistant_allowances WHERE workspace_id=${a.workspaceId}::uuid`.execute(db);
  const usage=await sql`SELECT provider,model,charged_tokens,status,created_at FROM assistant_usage WHERE workspace_id=${a.workspaceId}::uuid AND user_id=${a.userId}::uuid ORDER BY created_at DESC LIMIT 20`.execute(db);
  const providers=assistantProviderNames();
  res.json({
    enabled:providers.length>0,
    providers,
    remainingTokens:Number(bal.rows[0]?.remaining_tokens??0),
    unit:'provider tokens',
    isAdmin,
    dailyMessagesUsed:countToday,
    dailyMessageLimit:isAdmin?null:10,
    history:usage.rows
  });
}));

assistantRouter.post('/conversations/:id/messages',limiter,route(async(req,res)=>{
 const a=auth(req),c=await conversation(convId(req),a.userId,a.workspaceId);
 const b=parse(z.object({content:z.string().trim().min(1).max(200_000)}).strict(),req.body);
 const isAdmin=Boolean(a.isAdmin || a.role==='admin' || a.role==='owner');
 if(!isAdmin){
  const countRes=await sql<{count:number}>`SELECT count(*)::int AS count FROM assistant_messages m JOIN assistant_conversations ac ON ac.id=m.conversation_id WHERE ac.user_id=${a.userId}::uuid AND m.role='user' AND m.created_at>=date_trunc('day',now())`.execute(db);
  const countToday=countRes.rows[0]?.count??0;
  if(countToday>=10){
   throw new HttpError(429,'Daily message limit reached (10 messages per day). Admins have unlimited messages.','daily_message_limit_reached');
  }
 }
 const previous=await sql<{content:string}>`SELECT content FROM assistant_messages WHERE conversation_id=${c.id}::uuid AND role='user' ORDER BY created_at DESC LIMIT 4`.execute(db);
 await sql`INSERT INTO assistant_messages(conversation_id,role,content) VALUES(${c.id}::uuid,'user',${b.content})`.execute(db);
 await sql`UPDATE assistant_conversations SET title=CASE WHEN title='New conversation' THEN ${b.content.slice(0,80)} ELSE title END,updated_at=now() WHERE id=${c.id}::uuid`.execute(db);
 let reply='',sources:Source[]=[],isAiGenerated=false;const text=b.content.trim();
  // All messages route to AI assistant with internal MCP tools for querying, updating, and creating records
   const words = [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(w => !['how','the','and','can','you','does','for','what','with','from','this','that','help'].includes(w)))];
   const docs = await db.selectFrom('help_articles').select(['slug','title','summary','body','keywords','category']).where('status','=','published').where('audience','in',a.role==='member'&&!a.isAdmin?['everyone']:['everyone','workspace_admin']).limit(200).execute();
   const guides = docs.map(d => ({d, score: words.reduce((n, w) => n + (`${d.title} ${d.summary} ${d.body} ${(Array.isArray(d.keywords) ? d.keywords.join(' ') : '')} ${d.category}`.toLowerCase().includes(w) ? 1 : 0), 0)})).filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 3).map(x => x.d);
   if (!guides.length && /\b(help|guide|platform|velocity|start|manage|project)\b/i.test(text)) {
     const fallbackDocs = docs.filter(d => /project|getting-started|overview|workflow/i.test(d.slug || d.title)).slice(0, 2);
     guides.push(...fallbackDocs);
   }

   const workspaceProjects = await db.selectFrom('projects').select(['id','project_key','name','description']).where('workspace_id','=',a.workspaceId).orderBy('updated_at','desc').limit(20).execute();
   let currentProjectIssues: {id:string;summary:string;status:string;priority:string;issue_number:number}[] = [];
   let activeJourney: unknown = null;
   if (c.project_id) {
     currentProjectIssues = await db.selectFrom('issues').select(['id','summary','status','priority','issue_number']).where('project_id','=',c.project_id).orderBy('updated_at','desc').limit(20).execute();
     // The selected project's Journey is the assistant's primary context: stages,
     // progress, next action, blockers, approvals and upcoming milestones.
     activeJourney = await journeyContextForProject(a.workspaceId, c.project_id);
   }

   const context = JSON.stringify({
     workspaceRole: a.role,
     workspaceProjects: workspaceProjects.map(p => ({ key: p.project_key, name: p.name, description: p.description })),
     activeConversationProject: c.project_id ? {
       key: c.project_key,
       name: c.project_name,
       journey: activeJourney,
       recentIssues: currentProjectIssues.map(i => ({ key: `${c.project_key}-${i.issue_number}`, summary: i.summary, status: i.status, priority: i.priority }))
     } : null,
     guides: guides.map(d => ({ title: d.title, body: d.body.slice(0, 1000) }))
   });

   sources = [
    ...(c.project_id ? [{ type: 'project' as const, title: `${c.project_key} · ${c.project_name}`, url: `/?project=${c.project_id}` }] : []),
    ...workspaceProjects.slice(0, 3).map(p => ({ type: 'project' as const, recordId: p.id, title: `${p.project_key} · ${p.name}`, url: `/?project=${p.id}` })),
     ...currentProjectIssues.slice(0, 5).map(i => ({ type: 'issue' as const, recordId: i.id, title: `${c.project_key}-${i.issue_number} · ${i.summary}`, url: `/projects/${c.project_id}/issues?issueId=${i.id}` })),
     ...guides.map(d => ({ type: 'help' as const, title: d.title, slug: d.slug, url: `/help/${d.slug}` }))
   ];

   try {
     reply = await generateAssistantReply(a, c.id, [
       {
         role: 'system',
         content: `You are Solution Velocity's AI Engineering Assistant for a journey-first product development platform. Every project has a Journey: ordered stages holding activities (requirements, milestones, deliverables, documents, approvals, decisions, risks) plus tasks attached to stages. The supplied context includes the selected project's Journey — current stage, progress, next action, blockers, pending approvals and upcoming milestones — and that project's tasks. Treat that Journey as the source of truth for what the team should do next.

Core Operating Principles:
• Take Action: Proactively use your MCP tools to read journeys (get_project_journey), add or update journey activities (create_journey_activity, update_journey_activity), create projects and tasks, update issue status or priority, query project data, and search Help Centre guides whenever requested. Always confirm actions clearly citing the exact key (e.g. PROJ-101, FLOW) plus the stage and task or activity title.
• Informative & Courteous: Explain findings and updates nicely, clearly, and concisely in structured markdown. Keep answers helpful, constructive, and direct.
• Stay On Topic: Keep responses strictly focused on the workspace's journey, engineering, projects, tasks, issue management, and platform guides. If asked about off-topic or unrelated subjects, politely decline and guide the user back to their project work.
• Grounded & Isolated: Ground every answer in the selected project's context. Never invent non-existent task IDs, imaginary metrics, or unverified facts, and never mix in another project's data.`
       },
       {
         role: 'user',
         content: `Workspace context: ${context}\nPrevious user questions in this conversation: ${JSON.stringify(previous.rows.reverse().map(r => r.content))}\nCurrent question: ${text}`
       }
     ]);
     isAiGenerated = true;
   } catch (error) {
     if (error instanceof HttpError && error.status === 429) {
       reply = error.message;
       sources = [];
     } else if (guides.length > 0) {
       reply = `### Help Centre Guidance\n\n` +
         guides.map(d => `#### [${d.title}](/help/${d.slug})\n${d.summary ? `*${d.summary}*\n\n` : ''}${d.body}`).join('\n\n---\n\n');
       sources = guides.map(d => ({ type: 'help' as const, title: d.title, slug: d.slug, url: `/help/${d.slug}` }));
     } else if (/\b(projects?|workspaces?)\b/i.test(text) && workspaceProjects.length > 0) {
       reply = `### Workspace Projects\n\nHere are the projects in this workspace:\n\n` +
         workspaceProjects.map(p => `• **${p.project_key} · ${p.name}**${p.description ? ` — ${p.description}` : ''}`).join('\n') +
         `\n\nSelect a project or open its issues to manage tasks.`;
       sources = workspaceProjects.slice(0, 3).map(p => ({ type: 'project' as const, recordId: p.id, title: `${p.project_key} · ${p.name}`, url: `/projects/${p.id}/issues` }));
     } else if (c.project_id && (currentProjectIssues.length > 0 || /\b(issues?|tasks?|status|progress|summary)\b/i.test(text))) {
       reply = `### Task Status for ${c.project_key} · ${c.project_name}\n\n` +
         (currentProjectIssues.length ? currentProjectIssues.map(i => `• **${c.project_key}-${i.issue_number}**: ${i.summary} (${i.status}, ${i.priority})`).join('\n') : 'No open tasks found.') +
         `\n\n*Snapshot of recorded project issues.*`;
       sources = currentProjectIssues.slice(0, 5).map(i => ({ type: 'issue' as const, recordId: i.id, title: `${c.project_key}-${i.issue_number} · ${i.summary}`, url: `/projects/${c.project_id}/issues?issueId=${i.id}` }));
     } else {
       reply = `I can help you navigate workspace projects, view tasks, and explore Help Centre guidance.\n\n` +
         (workspaceProjects.length ? `• **Workspace Projects**: ${workspaceProjects.map(p => `${p.project_key} (${p.name})`).join(', ')}\n` : '') +
         `• Browse the complete knowledge base in the [Help Centre](/help).`;
       sources = [
         ...workspaceProjects.slice(0, 2).map(p => ({ type: 'project' as const, recordId: p.id, title: `${p.project_key} · ${p.name}`, url: `/projects/${p.id}/issues` })),
         { type: 'help' as const, title: 'Help Centre', url: '/help' }
       ];
     }
   }
 if (!isAiGenerated) {
   reply += '\n\n---\n*Automated response*';
 }
 await sql`INSERT INTO assistant_messages(conversation_id,role,content,sources) VALUES(${c.id}::uuid,'assistant',${reply},${JSON.stringify(sources)}::jsonb)`.execute(db);
 res.status(201).json({ok:true});
}));

assistantRouter.post('/actions/:id/confirm',limiter,route(async(req,res)=>{
 const a=auth(req),id=convId(req);const result=await db.transaction().execute(async trx=>{
  const r=await sql<Action & {workspace_id:string;user_id:string;conversation_id:string|null}>`SELECT * FROM assistant_actions WHERE id=${id}::uuid AND workspace_id=${a.workspaceId}::uuid AND user_id=${a.userId}::uuid FOR UPDATE`.execute(trx);const act=r.rows[0];if(!act||!act.conversation_id)throw notFound('Action');if(act.status==='completed')return act.result;if(act.status!=='pending')throw badRequest('Action is no longer pending');
  let outcome:{url:string;label:string};
  if(act.kind==='create_project'){
   if(a.role==='member')throw forbidden('Only owners and admins can create projects');const p=parse(z.object({name:shortText(120).min(1),key:z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)}).strict(),act.payload);
   const existing=await trx.selectFrom('projects').select('id').where('workspace_id','=',a.workspaceId).where('project_key','=',p.key).executeTakeFirst();if(existing)throw new HttpError(409,'That project key is already in use. Start a new proposal or create the project manually.','project_key_taken');
   const project=await trx.insertInto('projects').values({workspace_id:a.workspaceId,project_key:p.key,name:p.name,description:'',created_by:a.userId,updated_at:new Date()}).returning('id').executeTakeFirstOrThrow();outcome={url:`/projects/${project.id}/issues`,label:`Project ${p.key} · ${p.name} created`};
  } else if(act.kind==='create_issue') {
   const p=parse(z.object({projectId:uuid,projectName:z.string().nullable(),summary:shortText(200).min(1)}).strict(),act.payload);
   const project=await trx.selectFrom('projects').select(['id','project_key','next_issue_number']).where('id','=',p.projectId).where('workspace_id','=',a.workspaceId).forUpdate().executeTakeFirst();if(!project)throw notFound('Project');
   const issue=await trx.insertInto('issues').values({project_id:project.id,issue_number:project.next_issue_number,type:'Task',priority:'Medium',summary:p.summary,description:'',labels:[],reporter_id:a.userId,assignee_id:null,updated_at:new Date()}).returning('id').executeTakeFirstOrThrow();await trx.updateTable('projects').set({next_issue_number:project.next_issue_number+1,updated_at:new Date()}).where('id','=',project.id).execute();outcome={url:`/projects/${project.id}/issues?issueId=${issue.id}`,label:`Task ${project.project_key}-${project.next_issue_number} created`};
  }
  else if(act.kind==='update_issue_status'){
   const p=parse(z.object({projectId:uuid,issueId:uuid,issueKey:shortText(40),summary:shortText(200),previousStatus:z.enum(ISSUE_STATUSES),nextStatus:z.enum(ISSUE_STATUSES)}).strict(),act.payload);
   const project=await trx.selectFrom('projects').select(['id','project_key']).where('id','=',p.projectId).where('workspace_id','=',a.workspaceId).executeTakeFirst();if(!project)throw notFound('Project');
   const issue=await trx.selectFrom('issues').select(['id','issue_number','status','summary']).where('id','=',p.issueId).where('project_id','=',project.id).forUpdate().executeTakeFirst();if(!issue)throw notFound('Issue');
   if(issue.status!==p.previousStatus || issue.summary!==p.summary || `${project.project_key}-${issue.issue_number}`!==p.issueKey)throw conflict('This task changed since the proposal. Make a new proposal using its current details.');
   await trx.updateTable('issues').set({status:p.nextStatus,updated_at:new Date()}).where('id','=',issue.id).where('project_id','=',project.id).execute();
   outcome={url:`/projects/${project.id}/issues?issueId=${issue.id}`,label:`${p.issueKey} marked ${p.nextStatus}`};
  } else if(act.kind==='update_issue_priority'){
   const p=parse(z.object({projectId:uuid,issueId:uuid,issueKey:shortText(40),summary:shortText(200),previousPriority:z.enum(ISSUE_PRIORITIES),nextPriority:z.enum(ISSUE_PRIORITIES)}).strict(),act.payload);
   const project=await trx.selectFrom('projects').select(['id','project_key']).where('id','=',p.projectId).where('workspace_id','=',a.workspaceId).executeTakeFirst();if(!project)throw notFound('Project');
   const issue=await trx.selectFrom('issues').select(['id','issue_number','priority','summary']).where('id','=',p.issueId).where('project_id','=',project.id).forUpdate().executeTakeFirst();if(!issue)throw notFound('Issue');
   if(issue.priority!==p.previousPriority || issue.summary!==p.summary || `${project.project_key}-${issue.issue_number}`!==p.issueKey)throw conflict('This task changed since the proposal. Make a new proposal using its current details.');
   await trx.updateTable('issues').set({priority:p.nextPriority,updated_at:new Date()}).where('id','=',issue.id).where('project_id','=',project.id).execute();
   outcome={url:`/projects/${project.id}/issues?issueId=${issue.id}`,label:`${p.issueKey} priority set to ${p.nextPriority}`};
  } else throw badRequest('Unsupported action');
  await sql`UPDATE assistant_actions SET status='completed',result=${JSON.stringify(outcome)}::jsonb,completed_at=now() WHERE id=${id}::uuid`.execute(trx);return outcome;
 }).catch((err:unknown)=>{if(typeof err==='object'&&err!==null&&'code' in err&&err.code==='23505')throw conflict('The project key or issue number is already in use. Please try a new proposal.');throw err;});res.json(result);
}));
assistantRouter.post('/actions/:id/cancel',route(async(req,res)=>{const a=auth(req),id=convId(req);const r=await sql`UPDATE assistant_actions SET status='cancelled' WHERE id=${id}::uuid AND workspace_id=${a.workspaceId}::uuid AND user_id=${a.userId}::uuid AND status='pending' RETURNING id`.execute(db);if(!r.rows.length)throw notFound('Pending action');res.json({ok:true});}));

assistantAdminRouter.get('/allowances',route(async(_req,res)=>{const r=await sql`SELECT w.id,w.name,coalesce(a.remaining_tokens,0)::bigint AS remaining_tokens FROM workspaces w LEFT JOIN assistant_allowances a ON a.workspace_id=w.id ORDER BY w.name LIMIT 500`.execute(db);res.set('Cache-Control','no-store').json(r.rows);}));
assistantAdminRouter.get('/allowances/:id/usage',route(async(req,res)=>{const id=convId(req);const r=await sql`SELECT u.name AS user_name,au.provider,au.model,au.reserved_tokens,au.charged_tokens,au.status,au.created_at FROM assistant_usage au JOIN users u ON u.id=au.user_id WHERE au.workspace_id=${id}::uuid ORDER BY au.created_at DESC LIMIT 100`.execute(db);res.set('Cache-Control','no-store').json(r.rows);}));
assistantAdminRouter.post('/allowances/:id/grant',route(async(req,res)=>{const a=auth(req),id=convId(req),b=parse(z.object({tokens:z.number().int().min(1).max(10000000)}).strict(),req.body);const result=await db.transaction().execute(async trx=>{const w=await trx.selectFrom('workspaces').select('id').where('id','=',id).executeTakeFirst();if(!w)throw notFound('Workspace');const r=await sql<{remaining_tokens:number}>`INSERT INTO assistant_allowances(workspace_id,remaining_tokens) VALUES(${id}::uuid,${b.tokens}) ON CONFLICT(workspace_id) DO UPDATE SET remaining_tokens=assistant_allowances.remaining_tokens+${b.tokens},updated_at=now() RETURNING remaining_tokens`.execute(trx);await sql`INSERT INTO assistant_credit_events(workspace_id,actor_id,delta_tokens,balance_after) VALUES(${id}::uuid,${a.userId}::uuid,${b.tokens},${r.rows[0].remaining_tokens})`.execute(trx);return r.rows[0];});res.json(result);}));
