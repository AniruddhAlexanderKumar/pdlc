import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { CadDetail, CadDocument } from '@sv/cad-core';
import { ApiError, get, post } from '../api/client';
import { useSession } from '../api/hooks';
import { Button, Card, Input, PageHeader, Spinner } from '../components/ui';
import { SketchEditor } from '../cad/SketchEditor';

/** The server's default-off API is the feature gate; this never grants permissions. */
export function useCadDocuments() {
  const me = useSession();
  return useQuery({queryKey:['cad-documents',me.workspace.id],queryFn:()=>get<CadDocument[]>('/cad-documents'),enabled:!me.demo,retry:false});
}

export function CadDocumentsPage() {
  const me=useSession(),navigate=useNavigate(),qc=useQueryClient();
  const [name,setName]=useState(''),[search,setSearch]=useState(''),[view,setView]=useState<'workspace'|'mine'|'archived'>('workspace');
  const documents=useCadDocuments();
  const archived=useQuery({queryKey:['cad-archived',me.workspace.id],queryFn:()=>get<CadDocument[]>('/cad-documents/archived'),enabled:!me.demo&&!!documents.data&&view==='archived',retry:false});
  const refresh=()=>{void qc.invalidateQueries({queryKey:['cad-documents',me.workspace.id]});void qc.invalidateQueries({queryKey:['cad-archived',me.workspace.id]});};
  const create=useMutation({mutationFn:()=>post<CadDetail>('/cad-documents',{name:name.trim(),plane:'XY'}),onSuccess:d=>{refresh();navigate(`/designs/cad/${d.document.id}`)}});
  const archive=useMutation({mutationFn:({doc,restore}:{doc:CadDocument;restore:boolean})=>post<unknown>(`/cad-documents/${doc.id}/${restore?'unarchive':'archive'}`,{expectedRevision:doc.headRevision}),onSuccess:refresh});
  if(me.demo)return <div className="p-6">Experimental CAD documents are unavailable in the temporary demo.</div>;
  if(documents.isLoading)return <Spinner label="Checking CAD availability"/>;
  if(documents.isError)return <div className="space-y-3 p-6"><Link to="/designs" className="text-sm text-blue-700 underline dark:text-blue-300">Design Studio</Link><h1 className="text-xl font-semibold">Experimental CAD documents unavailable</h1><p role="alert">{documents.error instanceof ApiError&&documents.error.status===404?'The experimental CAD API is disabled.':documents.error.message}</p><Button variant="secondary" onClick={()=>void documents.refetch()}>Try again</Button></div>;
  const active=view==='archived'?archived.data:documents.data;
  const filtered=active?.filter(d=>(view!=='mine'||d.ownerId===me.user.id)&&d.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <><PageHeader title="Experimental CAD documents" subtitle="Manage stored XY sketches in this workspace."/><div className="space-y-5 p-4 md:p-6">
    <Link to="/designs" className="text-sm text-blue-700 underline dark:text-blue-300">Back to Design Studio</Link>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">Development only: experimental XY sketch editing and autosave are available within solver limits. Feature history and 3D modelling are not available. Do not use it for production or engineering decisions.</p>
    <Card className="p-5"><h2 className="font-semibold">Create an empty XY sketch</h2><form className="mt-3 flex max-w-xl flex-wrap items-end gap-3" onSubmit={(e:FormEvent)=>{e.preventDefault();if(name.trim()&&!create.isPending)create.mutate();}}><label className="min-w-48 flex-1 text-sm">Sketch name<Input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label><Button type="submit" loading={create.isPending} disabled={!name.trim()}>Create sketch</Button></form>{create.isError&&<p role="alert" className="mt-2 text-sm text-rose-700">{create.error.message} If the response was interrupted, refresh the list before retrying; the server may have created the sketch.</p>}</Card>
    <div className="flex flex-wrap items-end gap-3"><label className="block max-w-md flex-1 text-sm">Search sketches<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search loaded sketches by name"/></label><div role="group" aria-label="Sketch list" className="flex flex-wrap gap-2">{([['workspace','Workspace'],['mine','My sketches'],['archived','Archived']] as const).map(([key,label])=><Button key={key} type="button" variant={view===key?'primary':'secondary'} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</Button>)}</div><Button type="button" variant="secondary" onClick={()=>{void documents.refetch();if(view==='archived')void archived.refetch();}}>Refresh</Button></div>
    <p className="text-xs text-zinc-500">The API returns at most 200 most recently updated sketches per list; search filters only the loaded results. Workspace members can read; creators and workspace owners or admins can archive and restore.</p>
    {archive.isError&&<p role="alert" className="text-sm text-rose-700">{archive.error.message} Refresh the list before retrying.</p>}
    {view==='archived'&&archived.isLoading?<Spinner label="Loading archived sketches"/>:view==='archived'&&archived.isError?<p role="alert">{archived.error.message}</p>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered?.map(d=><Card key={d.id} className="space-y-2 p-4"><h2 className="font-semibold">{d.name}</h2><p className="text-sm text-zinc-500">XY sketch · revision {d.headRevision} · {d.canEdit?'creator/admin access':'workspace read access'}</p><p className="text-xs text-zinc-500">Updated {new Date(d.updatedAt).toLocaleString()}{d.ownerId===me.user.id?' · Created by you':''}</p><div className="flex flex-wrap items-center gap-3">{view!=='archived'&&<Link to={`/designs/cad/${d.id}`} className="text-sm text-blue-700 underline dark:text-blue-300">Inspect sketch</Link>}{d.canEdit&&<button type="button" disabled={archive.isPending} className="text-sm text-blue-700 underline disabled:opacity-50 dark:text-blue-300" onClick={()=>{if(window.confirm(`${view==='archived'?'Restore':'Archive'} “${d.name}”?`))archive.mutate({doc:d,restore:view==='archived'});}}>{view==='archived'?'Restore':'Archive'}</button>}</div></Card>)}{filtered?.length===0&&<p className="text-sm text-zinc-500">No sketches match this view.</p>}</div>}
  </div></>;
}

export function CadDocumentPage() {
  const me=useSession(),{id=''}=useParams();
  const detail=useQuery({queryKey:['cad-detail',me.workspace.id,id],queryFn:()=>get<CadDetail>(`/cad-documents/${encodeURIComponent(id)}`),enabled:!me.demo&&!!id,retry:false,gcTime:0,refetchOnWindowFocus:false});
  if(me.demo)return <div className="p-6">Experimental CAD documents are unavailable in the temporary demo.</div>;
  if(detail.isLoading)return <Spinner label="Loading sketch"/>;
  if(detail.isError||!detail.data)return <div className="space-y-3 p-6"><Link to="/designs/cad" className="text-sm text-blue-700 underline dark:text-blue-300">CAD documents</Link><p role="alert">{detail.error?.message??'Could not load sketch.'}</p><Button variant="secondary" onClick={()=>void detail.refetch()}>Try again</Button></div>;
  const {document}=detail.data;
  return <SketchEditor key={`${me.workspace.id}:${me.user.id}:${document.id}`} initial={detail.data} workspaceId={me.workspace.id} userId={me.user.id}/>;
}
