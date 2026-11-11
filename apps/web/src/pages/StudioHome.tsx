import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Boxes, FileClock, FolderKanban, Layers3, PencilRuler } from 'lucide-react';
import { Link, useBlocker, useNavigate } from 'react-router';
import type { CadDetail } from '@sv/cad-core';
import { ApiError, post } from '../api/client';
import { useSession } from '../api/hooks';
import { Button, Input, Spinner } from '../components/ui';
import { useCadDocuments } from './CadDocuments';

/** Workspace-level entry; CAD documents are not yet linked to projects or products. */
export function StudioHomePage() {
  const me = useSession();
  return <StudioHome key={`${me.user.id}:${me.workspace.id}`} />;
}

function StudioHome() {
  const me = useSession();
  const documents = useCadDocuments();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [createdId, setCreatedId] = useState('');
  const createdIdRef = useRef('');
  const create = useMutation({
    mutationFn: () => post<CadDetail>('/cad-documents', { name: name.trim(), plane: 'XY' }),
    onSuccess: result => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['cad-documents', me.workspace.id] });
      createdIdRef.current = result.document.id;
      setCreatedId(result.document.id);
    }
  });
  useEffect(() => { if (createdId && !create.isPending && !name.trim()) navigate(`/designs/cad/${createdId}`); }, [createdId, create.isPending, name, navigate]);
  const unsaved = !!name.trim() || create.isPending;
  const blocker = useBlocker(({currentLocation,nextLocation}) => unsaved && currentLocation.pathname !== nextLocation.pathname && nextLocation.pathname !== `/designs/cad/${createdIdRef.current}`);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (create.isPending) blocker.reset();
    else if (window.confirm('Discard the new sketch name?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, create.isPending]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } };
    const session = (event: Event) => {
      if (create.isPending || (name.trim() && !window.confirm('Discard the new sketch name before changing workspace or signing out?'))) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('sv:before-session-change', session);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('sv:before-session-change', session); };
  }, [unsaved, name, create.isPending]);

  const unavailable = documents.error instanceof ApiError && documents.error.status === 404;
  const filtered = documents.data?.filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim() && !create.isPending) create.mutate(); };

  return <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <header className="border-b border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900 md:px-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Product development / Design</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Design Studio</h1><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">A focused starting point for your design work.</p></div><span className="text-xs text-zinc-500">Workspace: {me.workspace.name}</span></div>
    </header>
    <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 md:px-8 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Studio navigation" className="space-y-1 text-sm">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspace</p>
        <span aria-current="page" className="flex items-center gap-2 rounded-md bg-zinc-200 px-3 py-2 font-medium dark:bg-zinc-800"><PencilRuler className="h-4 w-4" aria-hidden="true"/>Sketches</span>
        <Link to="/projects" className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"><FolderKanban className="h-4 w-4" aria-hidden="true"/>Projects</Link>
        <Link to="/products" className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"><Boxes className="h-4 w-4" aria-hidden="true"/>Products</Link>
        {!me.demo && <Link to="/designs/diagrams" className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"><FileClock className="h-4 w-4" aria-hidden="true"/>Previous diagrams</Link>}
      </nav>
      <main className="min-w-0 space-y-6">
        <section aria-labelledby="sketches-heading" className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800"><div><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Experimental · 2D only</p><h2 id="sketches-heading" className="mt-1 text-lg font-semibold">Sketch workspace</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Draw and constrain simple XY sketches in an experimental editor. This is not a production CAD system; do not use it for engineering decisions. 3D modelling is not available.</p></div>{documents.isSuccess && <Link to="/designs/cad" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Manage sketches <ArrowRight className="h-4 w-4" aria-hidden="true"/></Link>}</div>
          {me.demo ? <p className="p-5 text-sm text-zinc-600 dark:text-zinc-400">The sketch workspace is not available in the temporary demo.</p> : documents.isLoading ? <div className="p-5"><Spinner label="Checking sketch availability"/></div> : documents.isError ? <div className="space-y-3 p-5"><p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">{unavailable ? 'The experimental sketch workspace is disabled on this deployment.' : 'Could not check whether the sketch workspace is available.'}</p>{!unavailable && <Button variant="secondary" size="sm" onClick={() => void documents.refetch()}>Try again</Button>}</div> : <div className="space-y-5 p-5">
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3"><label className="min-w-[12rem] max-w-md flex-1 text-sm font-medium">New sketch name<Input required maxLength={120} value={name} disabled={create.isPending} onChange={event => setName(event.target.value)} placeholder="e.g. enclosure outline"/></label><Button type="submit" loading={create.isPending} disabled={!name.trim() || create.isPending}>Create XY sketch</Button></form>
            {create.isError && <p role="alert" className="text-sm text-rose-700">Could not confirm sketch creation. Refresh the sketch list and check it before retrying; the server may have created it.</p>}
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Recent sketches</h3><p className="mt-1 text-xs text-zinc-500">Up to 200 workspace sketches, sorted by recent update.</p></div><label className="block w-full max-w-xs text-xs font-medium">Search loaded sketches<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name"/></label></div>
            {filtered?.length ? <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">{filtered.map(item => <li key={item.id}><Link to={`/designs/cad/${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:text-blue-700 dark:hover:text-blue-300"><span className="min-w-0 font-medium">{item.name}</span><span className="text-xs text-zinc-500">XY sketch · revision {item.headRevision} · updated {new Date(item.updatedAt).toLocaleDateString()}</span></Link></li>)}</ul> : <p className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">{search ? 'No loaded sketches match this search.' : 'No sketches yet. Name a sketch above to start.'}</p>}
          </div>}
        </section>
        <section aria-labelledby="context-heading" className="border-t border-zinc-200 pt-5 dark:border-zinc-800"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-zinc-500" aria-hidden="true"/><h2 id="context-heading" className="text-sm font-semibold">Product lifecycle context</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Projects and product records are available alongside design work. Experimental sketches are workspace-wide and cannot yet be linked to a project or product; these links do not create an association or change access.</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium"><Link to="/projects" className="text-blue-700 hover:underline dark:text-blue-300">Open projects →</Link><Link to="/products" className="text-blue-700 hover:underline dark:text-blue-300">Open product records →</Link></div></section>
      </main>
    </div>
  </div>;
}
