import { sql } from 'kysely';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/http.js';
import type { AiChatMessage } from './ai.js';
import { assistantRequestBody, parseAssistantProviders, type AssistantProvider as Provider } from './assistant-providers.js';

function configuredProviders(): Provider[] {
  try {
    return parseAssistantProviders(process.env, {name:'configured AI',baseUrl:config.aiBaseUrl,model:config.AI_MODEL,apiKey:config.AI_API_KEY});
  } catch { logger.error('Assistant provider configuration is invalid'); return []; }
}
export function assistantProviderNames() { return configuredProviders().map(provider => provider.name); }

/** Reserve before each attempt. On ambiguous transport errors the reservation is charged, never silently released. */
async function reserve(workspaceId:string,userId:string,conversationId:string,provider:Provider,amount:number) {
 return db.transaction().execute(async trx=>{
  const balance=await sql<{remaining_tokens:number}>`SELECT remaining_tokens FROM assistant_allowances WHERE workspace_id=${workspaceId}::uuid FOR UPDATE`.execute(trx);
  if(!balance.rows[0] || Number(balance.rows[0].remaining_tokens)<amount) throw new HttpError(402,'Not enough assistant token credits for this request. Ask a system administrator about your allowance.','assistant_allowance_exhausted');
  await sql`UPDATE assistant_allowances SET remaining_tokens=remaining_tokens-${amount},updated_at=now() WHERE workspace_id=${workspaceId}::uuid`.execute(trx);
  const result=await sql<{id:string}>`INSERT INTO assistant_usage(workspace_id,user_id,conversation_id,provider,model,reserved_tokens,status) VALUES(${workspaceId}::uuid,${userId}::uuid,${conversationId}::uuid,${provider.name},${provider.model},${amount},'reserved') RETURNING id`.execute(trx);
  return result.rows[0].id;
 });
}
async function settle(id:string,workspaceId:string,reserved:number,charged:number,status:'success'|'failed'|'uncertain') {
 await db.transaction().execute(async trx=>{
  const row=await sql<{id:string}>`UPDATE assistant_usage SET status=${status},charged_tokens=${charged},completed_at=now() WHERE id=${id}::uuid AND status='reserved' RETURNING id`.execute(trx);
  if(row.rows.length) await sql`UPDATE assistant_allowances SET remaining_tokens=remaining_tokens+${reserved-charged},updated_at=now() WHERE workspace_id=${workspaceId}::uuid`.execute(trx);
 });
}
export async function generateAssistantReply(actor:{workspaceId:string;userId:string},conversationId:string,messages:AiChatMessage[]):Promise<string> {
 const providers=configuredProviders();
 if(!providers.length) throw new HttpError(503,'AI generation is not configured. Project summaries and Help Centre search remain available.','assistant_ai_unavailable');
 // Conservative UTF-8 byte budget; charge reported actual tokens and allow a negative balance if a provider exceeds its reservation.
 const maxOutput=500, budget=Math.min(100000,Buffer.byteLength(JSON.stringify(messages),'utf8')*2+maxOutput+512);
 for(const [index,provider] of providers.entries()) {
  const usageId=await reserve(actor.workspaceId,actor.userId,conversationId,provider,budget);
  let response:Response;
  try {
   response=await fetch(`${provider.baseUrl.replace(/\/+$/,'')}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',...(provider.apiKey?{authorization:`Bearer ${provider.apiKey}`}:{})},body:JSON.stringify(assistantRequestBody(provider,messages,maxOutput)),signal:AbortSignal.timeout(20000)});
  } catch {
   await settle(usageId,actor.workspaceId,budget,budget,'uncertain');
   logger.warn({provider:provider.name,attempt:index+1},'Assistant provider transport failed; reserved credits retained for reconciliation');
   continue;
  }
  if(!response.ok) {
   const retry=[401,402,403,408,429].includes(response.status)||response.status>=500;
   // A provider error may have incurred usage. Retain the reservation for uncertain server/time-out failures.
   const uncertain=response.status===408||response.status>=500;
   await settle(usageId,actor.workspaceId,budget,uncertain?budget:0,uncertain?'uncertain':'failed');
   logger.warn({provider:provider.name,status:response.status,attempt:index+1},'Assistant provider request failed');
   if(retry) continue;
   throw new HttpError(502,'The AI provider rejected the request.','assistant_provider_error');
  }
  try {
   const data=await response.json() as {choices?:{message?:{content?:unknown}}[];usage?:{total_tokens?:unknown}};
   const text=data.choices?.[0]?.message?.content, tokens=data.usage?.total_tokens;
   if(typeof text!=='string'||!text.trim()||text.length>12000||!Number.isSafeInteger(tokens)||Number(tokens)<=0||Number(tokens)>1000000) throw new Error('Invalid provider response');
   await settle(usageId,actor.workspaceId,budget,Number(tokens),'success');
   if(index) logger.info({provider:provider.name,attempt:index+1},'Assistant provider fallback succeeded');
   return text;
  } catch {
   await settle(usageId,actor.workspaceId,budget,budget,'uncertain');
   logger.warn({provider:provider.name,attempt:index+1},'Assistant provider response could not be accounted for');
  }
 }
 throw new HttpError(503,'AI providers are unavailable or did not return usable usage information. Any uncertain attempts are reserved for review.','assistant_ai_unavailable');
}
