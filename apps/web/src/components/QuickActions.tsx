import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import type { Project } from '@sv/shared';
import { get } from '../api/client';
import { useSession, useWorkspaceData } from '../api/hooks';
import { Button, Input, Modal } from './ui';
export function QuickActions({onNew}:{onNew:()=>void}){
 const me=useSession(),navigate=useNavigate(),[open,setOpen]=useState(false),[query,setQuery]=useState('');
 const close=useCallback(()=>setOpen(false),[]);const products=useWorkspaceData();
 const projects=useQuery({queryKey:['projects'],queryFn:()=>get<Project[]>('/projects'),enabled:open});
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(v=>!v);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 const actions=[{label:'Open Help Centre',run:()=>navigate('/help')},{label:'Open Projects',run:()=>navigate('/projects')},{label:'Open Teamwork Graph',run:()=>navigate('/teamwork-graph')},{label:'Create product',run:onNew},...(me.workspace.role!=='member'?[{label:'Create project',run:()=>navigate('/projects?create=1')}]:[]),...(me.workspace.role!=='member'&&!me.demo?[{label:'External review access',run:()=>navigate('/external-reviews')}]:[])];
 const term=query.trim().toLowerCase(), visible=actions.filter(a=>a.label.toLowerCase().includes(term));const matchingProjects=term?(projects.data??[]).filter(p=>`${p.name} ${p.key}`.toLowerCase().includes(term)).slice(0,8):[];const matchingProducts=term?(products.data?.products??[]).filter(p=>p.name.toLowerCase().includes(term)).slice(0,8):[];
 const run=(fn:()=>void)=>{close();setQuery('');fn();};
 return <><Button onClick={()=>setOpen(true)} className="fixed bottom-24 right-4 z-20 shadow-lg md:bottom-5" icon={<Search className="h-4 w-4" />} aria-label="Open quick actions">Actions <span className="hidden text-xs opacity-75 sm:inline">Ctrl K</span></Button>{open&&<Modal title="Quick actions" subtitle="Search actions, projects and products" onClose={close}><Input aria-label="Search actions and records" placeholder="Search actions or records" value={query} onChange={e=>setQuery(e.target.value)}/><div className="mt-3 space-y-1">{visible.map(a=><button key={a.label} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>run(a.run)}>{a.label}</button>)}{matchingProjects.map(p=><button key={p.id} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>run(()=>navigate(`/projects/${p.id}/issues`))}>Project · {p.key} · {p.name}</button>)}{matchingProducts.map(p=><button key={p.id} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>run(()=>navigate(`/products/${p.id}`))}>Product · {p.name}</button>)}{visible.length===0&&matchingProjects.length===0&&matchingProducts.length===0&&<p className="p-3 text-sm text-zinc-500">No matching actions or records.</p>}{projects.isError&&<p role="alert" className="p-3 text-xs text-rose-700">Projects could not be searched.</p>}</div></Modal>}</>;
}
