import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, PencilRuler } from 'lucide-react';
import { Link, useBlocker, useParams } from 'react-router';
import type { DesignDetail, DesignDocument, Project } from '@sv/shared';
import { get, post } from '../api/client';
import { useSession } from '../api/hooks';
import { Button, Card, Field, Input, PageHeader, Spinner } from '../components/ui';

/** A project entry point, not a new permission boundary or a data migration. */
export function ProjectHomePage() {
  const { projectId = '' } = useParams();
  const me = useSession();
  return <ProjectHome key={`${me.user.id}:${me.workspace.id}:${projectId}`} projectId={projectId} />;
}

function ProjectHome({ projectId }: { projectId: string }) {
  const me = useSession();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [created, setCreated] = useState<DesignDocument | null>(null);
  const projects = useQuery({ queryKey: ['projects', me.workspace.id], queryFn: () => get<Project[]>('/projects') });
  const project = projects.data?.find(item => item.id === projectId);
  const designs = useQuery({
    queryKey: ['designs', me.workspace.id, 'project', projectId],
    queryFn: () => get<DesignDocument[]>(`/designs?projectId=${encodeURIComponent(projectId)}`),
    enabled: !!project && !me.demo
  });
  const create = useMutation({
    mutationFn: () => post<DesignDetail>('/designs', { title: title.trim(), projectId, productId: null }),
    onSuccess: (result) => {
      setCreated(result.document);
      setTitle('');
      void qc.invalidateQueries({ queryKey: ['designs', me.workspace.id] });
    }
  });

  const unsaved = Boolean(title.trim()) || create.isPending;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (create.isPending) { blocker.reset(); return; }
      if (window.confirm('Discard the unsaved diagram name before leaving this project?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, create.isPending]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } };
    const beforeSessionChange = (event: Event) => {
      if (create.isPending || (title.trim() && !window.confirm('Discard the unsaved diagram name before changing workspace or signing out?'))) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('sv:before-session-change', beforeSessionChange);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('sv:before-session-change', beforeSessionChange); };
  }, [unsaved, title, create.isPending]);

  if (projects.isLoading) return <Spinner label="Loading project" />;
  if (projects.isError) return <p role="alert" className="m-6 text-sm text-rose-700">Could not load projects. <button type="button" className="underline" onClick={() => void projects.refetch()}>Try again</button></p>;
  if (!project) return <div className="p-6"><h1 className="text-xl font-semibold">Project not found</h1><p className="mt-2 text-sm text-zinc-500">It may not belong to this workspace.</p><Link to="/projects" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Choose a project</Link></div>;

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (title.trim() && !create.isPending) create.mutate(); };
  return <>
    <PageHeader title={`${project.key} · ${project.name}`} subtitle={project.description || 'Project workspace'} />
    <div className="space-y-5 px-4 py-5 md:px-6">
      <Link to="/projects" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Switch project</Link>
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">This page shows issues and diagrams explicitly associated with this project. Products, catalogues, assistant conversations and other tools may still be workspace-wide; they have not been moved or isolated by selecting a project. Project records remain accessible to workspace members under existing permissions.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><ClipboardList className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">Project issues</h2><p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">View and manage this project's issues, statuses and assignments.</p><Link to={`/projects/${projectId}/issues`} className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">Open project issues →</Link></Card>
        <Card className="p-5"><PencilRuler className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">Project diagrams</h2><p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Conceptual diagrams linked to this project; not CAD or verified engineering schematics.</p>
          {me.demo ? <p className="mt-4 text-sm text-zinc-500">Design Studio is not available in the temporary demo.</p> : <>
            <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3"><div className="min-w-[12rem] flex-1"><Field label="New diagram name" htmlFor="project-diagram-title"><Input id="project-diagram-title" required maxLength={120} value={title} disabled={create.isPending} onChange={event => setTitle(event.target.value)} /></Field></div><Button type="submit" disabled={!title.trim() || create.isPending} loading={create.isPending}>Create diagram</Button></form>
            {create.isError && <p role="alert" className="mt-3 text-sm text-rose-700">Could not confirm creation. Refresh the list and check for the diagram before retrying; it may have been created.</p>}
            {created && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">Diagram created: <Link to={`/designs/${created.id}`} className="font-semibold underline">{created.title}</Link></p>}
            <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-700"><h3 className="text-sm font-semibold">Diagrams in this project</h3>
              {designs.isLoading ? <Spinner label="Loading project diagrams" /> : designs.isError ? <p role="alert" className="mt-2 text-sm text-rose-700">Could not load project diagrams. <button type="button" className="underline" onClick={() => void designs.refetch()}>Try again</button></p> : designs.data?.length ? <ul className="mt-2 space-y-2">{designs.data.map(design => <li key={design.id}><Link to={`/designs/${design.id}`} className="text-sm font-medium text-blue-700 underline dark:text-blue-400">{design.title}</Link><span className="ml-2 text-xs text-zinc-500">Revision {design.headRevision}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No diagrams are associated with this project yet.</p>}
              <p className="mt-3 text-xs leading-5 text-zinc-500">Shows up to the 200 most recently updated project diagrams. <Link to="/designs" className="underline">Open workspace Design Studio</Link> to see other diagrams.</p>
            </div>
          </>}
        </Card>
      </div>
    </div>
  </>;
}
