import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { JourneyActivity } from '@sv/shared';
import { get, post } from '../../api/client';
import { recordsKey, recordsPath, uploadJourneyFile, useJourneyRecords, type ReleaseContents, type WorkRecord } from '../../api/journeyRecords';
import { useActivityReview, useUpdateActivity } from '../../api/projectJourney';
import { Button, Input, Select, Textarea } from '../ui';
import { stepLabel } from './stepLabels';

const linkStyle = 'font-medium text-blue-700 underline dark:text-blue-300';
const listStyle = 'space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700';

export function StepWork({ projectId, activity }: { projectId: string; activity: JourneyActivity }) {
  const step = stepLabel(activity);
  const data = useJourneyRecords(projectId);
  const records = data.data?.records.filter(record => record.activityId === activity.id) ?? [];
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: recordsKey(projectId) });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(recordsPath(projectId), { activityId: activity.id, ...body }),
    onSuccess: refresh
  });
  const skip = useMutation({
    mutationFn: () => post(`/journeys/activities/${activity.id}/skip`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-journey', projectId] })
  });
  const status = useUpdateActivity(projectId);
  const review = useActivityReview(projectId);
  const [reviewNote, setReviewNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const completed = activity.status === 'completed';
  const hold = !completed && (activity.waitingOn.length > 0 || activity.status === 'blocked');
  const canFinish = step.tool === 'release'
    ? records.some(record => record.kind === 'release')
    : step.tool === 'design'
      ? activity.artifacts.length > 0 || records.some(record => ['file','diagram','sketch','model'].includes(record.kind))
      : records.some(record => record.kind === step.tool);
  const changes = records.filter(record => record.kind === 'change');

  if (data.isError) return <p role="alert">{data.error.message}</p>;
  if (!data.data) return <p>Loading step work…</p>;

  return <div className="space-y-4 border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
    {activity.waitingOn.length > 0 && <p>Finish {activity.waitingOn.map(item => item.title).join(', ')} first.</p>}
    {activity.status === 'blocked' && <p>{activity.blockedReason || 'Clear the blocker in Project history to continue.'}</p>}
    {step.tool === 'review' && <div className="space-y-2">
      <p>{activity.reviewState === 'pending' ? 'Waiting for approval.' : activity.reviewState === 'changes_requested' ? 'Changes requested.' : activity.reviewState === 'approved' ? 'Approved.' : 'Ready when your work is.'}</p>
      {activity.reviewNote && <p className="whitespace-pre-wrap">{activity.reviewNote}</p>}
      {!completed && !hold && <>
        <label className="block">Review notes <Textarea maxLength={1000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          {activity.reviewState === 'pending' ? <>
            <Button loading={review.isPending} onClick={() => review.mutate({ activityId: activity.id, action: 'approve', note: reviewNote })}>Approve</Button>
            <Button variant="secondary" disabled={!reviewNote.trim() || review.isPending} onClick={() => review.mutate({ activityId: activity.id, action: 'changes', note: reviewNote })}>Request changes</Button>
          </> : <Button loading={review.isPending} onClick={() => review.mutate({ activityId: activity.id, action: 'request', note: reviewNote })}>Ask for approval</Button>}
        </div>
      </>}
    </div>}
    {step.tool === 'design' && <Link className="inline-flex min-h-10 items-center rounded-md bg-[#16598d] px-4 font-semibold text-white" to={`/designs?project=${projectId}&step=${activity.id}`}>Open Design Studio</Link>}
    {step.tool === 'release' && <ReleasePanel projectId={projectId} activityId={activity.id} releases={records.filter(record => record.kind === 'release')} disabled={hold} />}
    {step.tool === 'part' && <h3 className="font-semibold">Parts and materials</h3>}
    {step.tool === 'requirement' && <h3 className="font-semibold">What it needs to do</h3>}
    {step.tool === 'test' && <h3 className="font-semibold">Tests and fixes</h3>}
    {['note','requirement','part','test','change'].includes(step.tool) && <>
      {records.filter(record => record.kind === step.tool && record.kind !== 'note').map(record => <div key={record.id} className={listStyle}>
        <p className="break-words font-semibold">{record.label}</p>
        {record.kind === 'part' && <p>Quantity {String(record.data.quantity)}</p>}
        {typeof record.data.text === 'string' && <p className="whitespace-pre-wrap break-words">{record.data.text}</p>}
        {record.kind === 'requirement' && <Select aria-label={`Status for ${record.label}`} disabled={save.isPending} value={String(record.data.state)} onChange={event => save.mutate({ ...record.data, recordId: record.id, state: event.target.value })}>
          <option>To do</option><option>In progress</option><option>Done</option>
        </Select>}
        {record.kind === 'test' && Boolean(record.data.fix) && <label className="flex items-start gap-2">
          <input type="checkbox" disabled={save.isPending} checked={Boolean(record.data.fixed)} onChange={event => save.mutate({ ...record.data, recordId: record.id, fixed: event.target.checked })} />
          <span>{record.data.fixed ? 'Fixed' : 'Open fix'} · {String(record.data.fix)}</span>
        </label>}
        {record.kind === 'part' && <Button variant="secondary" size="sm" onClick={() => setEditing(editing === record.id ? null : record.id)}>{editing === record.id ? 'Cancel edit' : 'Edit part'}</Button>}
        {editing === record.id && <RecordForm key={record.id} kind="part" record={record} pending={save.isPending} onSave={body => save.mutate(body, { onSuccess: () => setEditing(null) })} />}
      </div>)}
      {editing === null && <RecordForm kind={step.tool} record={records.find(record => record.kind === 'note')} pending={save.isPending} onSave={(body, done) => save.mutate(body, { onSuccess: done })} />}
    </>}
    <details open={step.tool === 'design' ? true : undefined} className={listStyle}>
      <summary className="cursor-pointer font-semibold">Files and designs</summary>
      <StepFiles projectId={projectId} activity={activity} />
    </details>
    {step.tool !== 'change' && <details className={listStyle}>
      <summary className="cursor-pointer font-semibold">Reviews and changes</summary>
      {changes.map(record => <p key={record.id} className="break-words"><strong>{record.label}</strong> · {String(record.data.text)}</p>)}
      <RecordForm kind="change" pending={save.isPending} onSave={(body, done) => save.mutate(body, { onSuccess: done })} />
    </details>}
    {!completed && !hold && step.tool !== 'review' && <div className="flex flex-wrap gap-2">
      {!canFinish && !step.optional && <p className="w-full text-xs text-zinc-500">Save your work on this step to mark it done.</p>}
      <Button variant="secondary" disabled={!canFinish || save.isPending || skip.isPending} loading={status.isPending} onClick={() => status.mutate({ activityId: activity.id, status: 'completed' })}>Mark step done</Button>
      {step.optional && <Button variant="secondary" loading={skip.isPending} disabled={status.isPending || save.isPending} onClick={() => skip.mutate()}>Skip optional step</Button>}
    </div>}
    {(save.error || status.error || review.error || skip.error) && <p role="alert">{(save.error || status.error || review.error || skip.error)?.message}</p>}
  </div>;
}

function RecordForm({ kind, record, pending, onSave }: {
  kind: string; record?: WorkRecord; pending: boolean;
  onSave: (body: Record<string, unknown>, done: () => void) => void;
}) {
  const [label, setLabel] = useState(record?.label ?? '');
  const [text, setText] = useState(String(record?.data.text ?? ''));
  const [quantity, setQuantity] = useState(String(record?.data.quantity ?? 1));
  const [fix, setFix] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ kind, recordId: record?.id, label, text, quantity: Number(quantity), fix, fixed: false, state: 'To do' }, () => {
      if (kind !== 'note' && !record) { setLabel(''); setText(''); setQuantity('1'); setFix(''); }
    });
  };
  const name = kind === 'part' ? 'Part or material name' : kind === 'test' ? 'What did you test?' : kind === 'change' ? 'What changed?' : 'Requirement';
  const details = kind === 'part' ? 'Notes (optional)' : kind === 'test' ? 'What happened?' : kind === 'change' ? 'Why did it change?' : 'Step notes';
  const action = kind === 'part' ? record ? 'Save part' : 'Add part' : kind === 'test' ? 'Record test' : kind === 'requirement' ? 'Add requirement' : kind === 'change' ? 'Record change' : 'Save notes';
  return <form onSubmit={submit} className="space-y-2">
    {kind !== 'note' && <label className="block">{name}<Input required maxLength={200} value={label} onChange={event => setLabel(event.target.value)} /></label>}
    {kind === 'part' && <label className="block max-w-32">Quantity<Input required type="number" min="0.000001" max={1e9} step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>}
    {kind !== 'requirement' && <label className="block">{details}<Textarea required={kind !== 'part'} maxLength={4000} value={text} onChange={event => setText(event.target.value)} /></label>}
    {kind === 'test' && <label className="block">What needs fixing? (optional)<Input maxLength={4000} value={fix} onChange={event => setFix(event.target.value)} /></label>}
    <Button type="submit" size="sm" loading={pending}>{action}</Button>
  </form>;
}

export function StepFiles({ projectId, activity }: { projectId: string; activity: JourneyActivity }) {
  const qc = useQueryClient();
  const query = useJourneyRecords(projectId);
  const records = query.data?.records.filter(record => record.activityId === activity.id) ?? [];
  const upload = useMutation({
    mutationFn: ({ file, recordId }: { file: File; recordId?: string }) => uploadJourneyFile(projectId, activity.id, file, recordId),
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey(projectId) })
  });
  const link = useMutation({
    mutationFn: (id: string) => {
      const design = query.data?.designs.find(item => item.id === id);
      if (!design) throw new Error('Choose a design from this project');
      return post(recordsPath(projectId), { activityId: activity.id, kind: design.kind, designId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey(projectId) })
  });
  const linkedIds = new Set([...activity.artifacts.map(item => item.id), ...records.filter(record => ['diagram','sketch','model'].includes(record.kind)).map(record => record.label)]);
  const linked = query.data?.designs.filter(item => linkedIds.has(item.id)) ?? [];
  const available = query.data?.designs.filter(item => !linkedIds.has(item.id)) ?? [];
  const uploadInput = (name: string, recordId?: string) => <label className="block min-w-0">
    <span className="block font-medium">{name}</span>
    <input className="block w-full text-sm" aria-label={name} type="file" disabled={upload.isPending} onChange={event => {
      const file = event.target.files?.[0];
      if (file) upload.mutate({ file, recordId });
      event.target.value = '';
    }} />
  </label>;
  return <div className="space-y-3">
    {linked.map(design => <p key={design.id}><Link className={linkStyle} to={designUrl(design.kind, design.id, projectId, activity.id)}>{design.label}</Link> · Version {design.revision}</p>)}
    {activity.artifacts.filter(item => !linked.some(design => design.id === item.id)).map(item => <p key={item.id}><Link className={linkStyle} to={item.url}>{item.title}</Link></p>)}
    {records.filter(record => record.kind === 'file').map(record => <div key={record.id} className={listStyle}>
      <a className={linkStyle} href={`/api${recordsPath(projectId)}/files/${record.versions[0]?.id}`}>{record.label}</a>
      <details><summary className="cursor-pointer">File versions ({record.versions.length})</summary>
        {record.versions.map((version, index) => <p key={version.id}><a className={linkStyle} href={`/api${recordsPath(projectId)}/files/${version.id}`}>Version {record.versions.length - index} · {version.filename}</a></p>)}
        {uploadInput('Save a new file version', record.id)}
      </details>
    </div>)}
    {uploadInput('Attach an existing file')}
    <p className="text-xs text-zinc-500">Up to 10 MB per file.</p>
    {available.length > 0 && <label className="block">Link a design
      <Select value="" disabled={link.isPending} onChange={event => event.target.value && link.mutate(event.target.value)}>
        <option value="">Choose a project design</option>
        {available.map(design => <option key={design.id} value={design.id}>{design.label}</option>)}
      </Select>
    </label>}
    {upload.isPending && <p role="status">Saving file…</p>}
    {(upload.error || link.error || query.error) && <p role="alert">{(upload.error || link.error || query.error)?.message}</p>}
  </div>;
}

export function designUrl(kind: string, id: string, projectId: string, activityId?: string) {
  const query = new URLSearchParams({ project: projectId });
  if (activityId) query.set('step', activityId);
  return `${kind === 'sketch' ? '/designs/cad/' : '/designs/'}${id}?${query}`;
}

function ReleasePanel({ projectId, activityId, releases, disabled }: { projectId: string; activityId: string; releases: WorkRecord[]; disabled: boolean }) {
  const path = recordsPath(projectId);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const preview = useQuery({ queryKey: ['release-preview', projectId], queryFn: () => get<ReleaseContents>(path + '/release-preview'), enabled: reviewing });
  const save = useMutation({
    mutationFn: () => post(path + '/release', { activityId, label: name, snapshot: preview.data?.token }),
    onSuccess: async () => { setName(''); setReviewing(false); await qc.invalidateQueries({ queryKey: recordsKey(projectId) }); },
    onError: () => void preview.refetch()
  });
  return <div className="space-y-2">
    {releases.map(release => <details key={release.id} className={listStyle}>
      <summary className="cursor-pointer font-semibold">{release.label}</summary>
      <ReleaseList projectId={projectId} contents={release.data as unknown as ReleaseContents} />
      <a className={linkStyle} href={`/api${path}/release/${release.id}`}>Download saved release</a>
    </details>)}
    {!reviewing && <Button disabled={disabled} onClick={() => setReviewing(true)}>Review release</Button>}
    {reviewing && preview.data && <form className={listStyle} onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <ReleaseList projectId={projectId} contents={preview.data} />
      <label className="block">Release name<Input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
      <Button type="submit" disabled={preview.isFetching || disabled || !(preview.data.designs.length || preview.data.records.length)} loading={save.isPending}>Save this release</Button>
    </form>}
    {reviewing && preview.isLoading && <p>Loading release contents…</p>}
    {(save.error || preview.error) && <p role="alert">{(save.error || preview.error)?.message}</p>}
  </div>;
}

function ReleaseList({ projectId, contents }: { projectId: string; contents: ReleaseContents }) {
  return <ul className="space-y-1 py-2">
    {contents.designs.map(item => <li key={item.id}>{item.label} · Design version {item.revision}{item.kind === 'model' && <> · <a className={linkStyle} href={`/api/designs/${item.id}/revisions/${item.revision}/stl`}>Download STL</a></>}</li>)}
    {contents.records.map(item => <li key={item.id} className="break-words">{item.version
      ? <a className={linkStyle} href={`/api${recordsPath(projectId)}/files/${item.version.id}`}>{item.version.filename} · Saved file</a>
      : item.kind === 'part' ? `${item.label} · Quantity ${item.data.quantity}${item.data.text ? ' · ' + item.data.text : ''}`
      : `${item.label} · ${item.data.text}${item.data.fix ? ' · ' + (item.data.fixed ? 'Fixed: ' : 'Open fix: ') + item.data.fix : ''}`}</li>)}
    {!contents.designs.length && !contents.records.length && <li>There are no designs, files, parts, or tests in this release.</li>}
  </ul>;
}
