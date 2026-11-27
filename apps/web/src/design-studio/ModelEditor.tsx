import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from 'react-router';
import { makeModelStl } from '@sv/cad-core';
import type { DesignDetail, DesignRevision, ModelSource } from '@sv/shared';
import { get, post, put } from '../api/client';
import { recordsKey } from '../api/journeyRecords';
import { StlViewer } from '../cad/StlViewer';
import { Button, Card, Input, Select } from '../components/ui';

const dimensions = ['width', 'depth', 'height'] as const;
const inputValues = (source: ModelSource) => ({ width: String(source.width), depth: String(source.depth), height: String(source.height) });

export function ModelEditor({ initial, workspaceId }: { initial: DesignDetail<ModelSource>; workspaceId: string }) {
  const [saved, setSaved] = useState(initial);
  const [profile, setProfile] = useState(initial.source.profile);
  const [values, setValues] = useState(() => inputValues(initial.source));
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const qc = useQueryClient();
  const { document } = saved;
  const path = `/designs/${document.id}`;
  const historyKey = ['design-revisions', workspaceId, document.id];
  const history = useQuery({ queryKey: historyKey, queryFn: () => get<DesignRevision[]>(path + '/revisions') });

  const draft: ModelSource = {
    schemaVersion: 1, profile, width: Number(values.width), depth: Number(values.depth), height: Number(values.height)
  };
  const dirty = dimensions.some(key => draft[key] !== saved.source[key]) || profile !== saved.source.profile;
  const geometry = useMemo(() => {
    try { return { bytes: makeModelStl(draft) }; }
    catch (error) { return { problem: error instanceof Error ? error.message : 'Could not build this shape.' }; }
  }, [profile, values]);

  useEffect(() => {
    if (!geometry.bytes) { setUrl(''); return; }
    const preview = URL.createObjectURL(new Blob([geometry.bytes], { type: 'model/stl' }));
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [geometry]);

  function receive(next: DesignDetail<ModelSource>) {
    setSaved(next);
    setProfile(next.source.profile);
    setValues(inputValues(next.source));
    setSummary('');
    qc.setQueryData(['design', workspaceId, document.id], next);
    void qc.invalidateQueries({ queryKey: historyKey });
    if (document.projectId) void qc.invalidateQueries({ queryKey: recordsKey(document.projectId) });
  }

  const save = useMutation({
    mutationFn: () => put<DesignDetail<ModelSource>>(path, { expectedRevision: document.headRevision, source: draft, summary }),
    onSuccess: receive
  });
  const restore = useMutation({
    mutationFn: (version: number) => post<DesignDetail<ModelSource>>(`${path}/revisions/${version}/restore`, { expectedRevision: document.headRevision }),
    onSuccess: next => { save.reset(); receive(next); }
  });
  const busy = save.isPending || restore.isPending;
  const locked = busy || !document.canEdit;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || busy) && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (!busy && window.confirm('Discard unsaved changes to this model?')) blocker.proceed();
    else blocker.reset();
  }, [blocker, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
    };
    const beforeSession = (event: Event) => {
      if (busy || (dirty && !window.confirm('Discard unsaved changes to this model?'))) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('sv:before-session-change', beforeSession);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('sv:before-session-change', beforeSession);
    };
  }, [dirty, busy]);

  return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <header>
      <h1 className="text-2xl font-semibold">{document.title}</h1>
      <p role="status" className="text-sm text-zinc-500">Version {document.headRevision} · {busy ? 'Saving…' : dirty ? 'Unsaved changes' : document.canEdit ? 'Saved' : 'Read only'}</p>
    </header>
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <Card className="min-w-0 overflow-hidden p-3">
        <h2 className="mb-2 font-semibold">3D preview</h2>
        {url ? <StlViewer url={url} autoRotate={false} /> : <p className="p-3 text-sm">Enter the model dimensions to see a preview.</p>}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Shape and dimensions</h2>
        <form onSubmit={event => {
          event.preventDefault();
          if (!locked && dirty && geometry.bytes) save.mutate();
        }}>
          <fieldset disabled={locked} className="space-y-3">
            <label className="block text-sm">Shape<Select aria-label="Shape" value={profile} onChange={event => setProfile(event.target.value as ModelSource['profile'])}>
              <option value="rectangle">Box</option><option value="circle">Cylinder</option><option value="triangle">Triangular prism</option>
            </Select></label>
            {dimensions.filter(key => profile !== 'circle' || key !== 'depth').map(key => {
              const label = key === 'width' && profile === 'circle' ? 'Diameter' : key.charAt(0).toUpperCase() + key.slice(1);
              return <label className="block text-sm" key={key}>{label} (mm)
                <Input required type="number" min={0.1} max={2000} step="any" value={values[key]} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} />
              </label>;
            })}
            <label className="block text-sm">What changed? (optional)<Input value={summary} maxLength={200} onChange={event => setSummary(event.target.value)} /></label>
            <Button type="submit" disabled={!dirty || !geometry.bytes}>Save a version</Button>
          </fieldset>
        </form>
        {(geometry.problem || save.error || restore.error) && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{geometry.problem || save.error?.message || restore.error?.message}</p>}
      </Card>
    </div>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Version history</h2>
      {history.error && <p role="alert">{history.error.message}</p>}
      {history.data?.map(version => <div key={version.revision} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800">
        <span>Version {version.revision}{version.summary ? ` · ${version.summary}` : ''}</span>
        <a href={`/api${path}/revisions/${version.revision}/stl`} className="text-blue-700 underline dark:text-blue-300">Download STL</a>
        {!locked && version.revision !== document.headRevision && <Button variant="secondary" size="sm" onClick={() => {
          if (window.confirm(`Restore version ${version.revision} as a new version?`)) restore.mutate(version.revision);
        }}>Restore version {version.revision}</Button>}
      </div>)}
    </Card>
  </div>;
}
