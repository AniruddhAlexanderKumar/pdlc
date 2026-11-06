import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useBlocker} from 'react-router';
import {solveSketch,startHistory,type CadDetail,type Sketch,type SketchHistory} from '@sv/cad-core';
import {ApiError,get,put} from '../api/client';
import {contentFingerprint,rebaseHistory} from './sketch-model';

type Draft={baseRevision:number;name:string;source:Sketch};
type SaveStatus='saved'|'unsaved'|'saving'|'error'|'conflict';
function readDraft(key:string,id:string):Draft|null {try{const raw=sessionStorage.getItem(key);if(!raw)return null;const d=JSON.parse(raw) as Draft;if(!d||typeof d.name!=='string'||!Number.isInteger(d.baseRevision)||d.source?.id!==id||d.source.revision!==d.baseRevision||!solveSketch(d.source).sketch)return null;return d}catch{return null}}
/** Single-flight saves; revision conflicts and uncertain network outcomes never overwrite server data. */
export function useSketchDocument(initial:CadDetail,workspaceId:string,userId:string){
 const key=`sv:cad-draft:${userId}:${workspaceId}:${initial.document.id}`;
 const [document,setDocument]=useState(initial.document),[name,setName]=useState(initial.document.name),[history,setHistory]=useState<SketchHistory>(()=>startHistory(initial.source));
 const [baseRevision,setBaseRevision]=useState(initial.document.headRevision),[ack,setAck]=useState(()=>contentFingerprint(initial.document.name,initial.source));
 const [recovery,setRecovery]=useState<Draft|null>(()=>{const d=readDraft(key,initial.document.id);return d&&!(d.baseRevision+1===initial.document.headRevision&&contentFingerprint(d.name,d.source)===contentFingerprint(initial.document.name,initial.source))?d:null;});
 const [status,setStatus]=useState<SaveStatus>('saved'),[message,setMessage]=useState(''),[storageWarning,setStorageWarning]=useState(false),[attempts,setAttempts]=useState(0);
 const saving=useRef(false),discardApproved=useRef(false);const dirty=contentFingerprint(name,history.current)!==ack;
 const live=useRef({history,name,baseRevision,dirty,status,recovery});live.current={history,name,baseRevision,dirty,status,recovery};
 const result=useMemo(()=>solveSketch(history.current),[history.current]);
 useEffect(()=>{
  if(!dirty||recovery)return;
  try{const draft:Draft={baseRevision,name,source:{...history.current,revision:baseRevision}};sessionStorage.setItem(key,JSON.stringify(draft));setStorageWarning(false)}catch{setStorageWarning(true)}
 },[dirty,recovery,key,baseRevision,name,history.current]);
 const removeDraft=useCallback(()=>{try{sessionStorage.removeItem(key)}catch{setStorageWarning(true)}},[key]);
 const finish=useCallback((d:CadDetail)=>{setDocument(d.document);setBaseRevision(d.document.headRevision);setName(d.document.name);setHistory(h=>rebaseHistory(h,d.source));setAck(contentFingerprint(d.document.name,d.source));setStatus('saved');setMessage('');setAttempts(0);removeDraft();},[removeDraft]);
 const save=useCallback(async()=>{
  const current=live.current;if(saving.current||!initial.document.canEdit||!current.dirty||current.recovery||current.status==='conflict')return;
  const captured:Draft={name:current.name.trim(),baseRevision:current.baseRevision,source:{...current.history.current,revision:current.baseRevision}};
  if(!captured.name){setStatus('error');setMessage('Document name is required.');setAttempts(3);return;}
  try{sessionStorage.setItem(key,JSON.stringify(captured));setStorageWarning(false)}catch{setStorageWarning(true)}
  saving.current=true;setStatus('saving');setMessage('');
  try{const d=await put<CadDetail>(`/cad-documents/${initial.document.id}`,{expectedRevision:captured.baseRevision,name:captured.name,source:captured.source});finish(d)}
  catch(error){
   const err=error instanceof Error?error:new Error('Save failed');let latest:CadDetail|null=null;
   // On a conflict or lost response, compare the server revision before deciding what happened.
   if(error instanceof ApiError&&(error.status===0||error.status===409||error.status>=500)){try{latest=await get<CadDetail>(`/cad-documents/${initial.document.id}`)}catch{/* preserve the draft and report uncertainty */}}
   if(latest&&latest.document.headRevision===captured.baseRevision+1&&contentFingerprint(latest.document.name,latest.source)===contentFingerprint(captured.name,captured.source))finish(latest);
   else if(latest&&latest.document.headRevision!==captured.baseRevision){setStatus('conflict');setMessage('A newer server revision exists. Your local sketch is preserved in this tab; download it before loading the server version.');}
   else if(error instanceof ApiError&&error.status===409){setStatus('conflict');setMessage('Save conflict could not be reconciled. Your local sketch is preserved; download it before loading the server version.');}
   else {setStatus('error');setMessage(`${err.message} Your changes are not confirmed saved.`);if(error instanceof ApiError&&(error.status===0||error.status>=500))setAttempts(x=>x+1);else setAttempts(3);}
  }finally{saving.current=false}
 },[initial.document.canEdit,initial.document.id,key,finish]);
 useEffect(()=>{if(!initial.document.canEdit||!dirty||recovery||status==='saving'||status==='conflict'||(status==='error'&&attempts>=3))return;const timer=window.setTimeout(()=>void save(),status==='error'?2500:1200);return()=>window.clearTimeout(timer)},[dirty,recovery,status,attempts,save,initial.document.canEdit]);
 useEffect(()=>{if(dirty&&status==='saved')setStatus('unsaved');},[dirty,status]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(live.current.dirty||live.current.recovery||saving.current){event.preventDefault();event.returnValue='';}};const session=(event:Event)=>{if((live.current.dirty||live.current.recovery||saving.current)&&!window.confirm('Leave this sketch? Unsaved changes are retained only in this browser tab.'))event.preventDefault();else discardApproved.current=true};const failed=()=>{discardApproved.current=false};window.addEventListener('beforeunload',before);window.addEventListener('sv:before-session-change',session);window.addEventListener('sv:session-change-failed',failed);return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('sv:before-session-change',session);window.removeEventListener('sv:session-change-failed',failed)}},[]);
 const blocker=useBlocker(({currentLocation,nextLocation})=>(dirty||!!recovery||status==='saving')&&!discardApproved.current&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{if(blocker.state==='blocked'){if(window.confirm('Leave this sketch? Unsaved changes are retained only in this browser tab.'))blocker.proceed();else blocker.reset();}},[blocker]);
 const recover=()=>{if(!recovery)return;setName(recovery.name);setHistory(startHistory(recovery.source));setBaseRevision(recovery.baseRevision);setStatus(recovery.baseRevision===document.headRevision?'unsaved':'conflict');setMessage(recovery.baseRevision===document.headRevision?'Recovered unsaved changes from this browser tab.':'Recovered a draft based on an older revision. Download it before loading the server version.');setRecovery(null);};
 const discardRecovery=()=>{removeDraft();setRecovery(null)};
 const download=()=>{const d:Draft=recovery??{baseRevision,name,source:history.current};const url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));const a=window.document.createElement('a');a.href=url;a.download=`sketch-recovery-${initial.document.id}.json`;a.click();URL.revokeObjectURL(url);};
 const loadServer=async()=>{if(!window.confirm('Load the latest server version and discard the local draft in this tab? Download it first if needed.'))return;try{const d=await get<CadDetail>(`/cad-documents/${initial.document.id}`);setHistory(startHistory(d.source));finish(d);setRecovery(null)}catch(e){setMessage(e instanceof Error?e.message:'Could not load the server version')}};
 return {document,name,setName,history,setHistory,result,dirty,status,message,storageWarning,recovery,recover,discardRecovery,download,loadServer,save,locked:!document.canEdit||status==='saving'||!!recovery,clearError:()=>{if(status==='error'){setStatus('unsaved');setAttempts(0);setMessage('')}}};
}
