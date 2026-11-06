import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  DOMAIN_LABELS, FUTURE_REQUIREMENTS, NAV_FOCUS, NAV_FOCUS_LABELS, REQUIREMENT_LABELS,
  WORK_DOMAINS, WORK_REQUIREMENTS, suggestWorkspaceNavigation,
  type NavFocus, type WorkDomain, type WorkRequirement, type WorkspaceProfile, type WorkspaceProfileInput
} from '@sv/shared';
import { put } from '../api/client';
import { useSession, useWorkspaceProfile } from '../api/hooks';
import { Button, Card, Spinner } from '../components/ui';

const toggle = <T,>(items: T[], item: T): T[] => items.includes(item) ? items.filter(value => value !== item) : [...items, item];

function SetupForm({ initial, workspaceId, canEdit }: { initial: WorkspaceProfile; workspaceId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [profile, setProfile] = useState<WorkspaceProfileInput>(initial.profile ?? { domains: [], objective: '', requirements: [], navigation: [] });
  const [revision, setRevision] = useState(initial.revision);
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => put<WorkspaceProfile>('/workspace/profile', { workspaceId, revision, profile }),
    onSuccess: result => {
      setRevision(result.revision); setReview(false); setSaved(true);
      qc.setQueryData(['workspace-profile', workspaceId], result);
    }
  });
  const update = (next: WorkspaceProfileInput) => { setProfile(next); setSaved(false); };
  return <div className="mx-auto max-w-4xl space-y-5 px-5 pt-5 pb-28 md:p-8">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">Workspace setup</p><h1 className="mt-2 text-2xl font-semibold">Make your workspace fit your work</h1><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Choose your interests and prioritise existing tools. This does not enable unavailable features, change permissions or remove data. Settings apply to this workspace for everyone.</p></header>
    {!canEdit && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">Only workspace owners and admins can change these settings.</p>}
    <form onSubmit={e => { e.preventDefault(); if (!review) setReview(true); else save.mutate(); }} className="space-y-5">
      <Card><fieldset disabled={!canEdit || review} className="space-y-3 p-5"><legend className="px-1 text-lg font-semibold">1. What are you working on?</legend><p className="text-sm text-zinc-500">Choose one or more. These are not restrictive categories.</p><div className="grid gap-2 sm:grid-cols-2">{WORK_DOMAINS.map(id => <label className="flex items-start gap-2 text-sm" key={id}><input type="checkbox" className="mt-1" checked={profile.domains.includes(id)} onChange={() => update({ ...profile, domains: toggle<WorkDomain>(profile.domains, id) })} />{DOMAIN_LABELS[id]}</label>)}</div></fieldset></Card>
      <Card><fieldset disabled={!canEdit || review} className="space-y-3 p-5"><legend className="px-1 text-lg font-semibold">2. What are you trying to achieve?</legend><label htmlFor="objective-example" className="block text-sm text-zinc-600 dark:text-zinc-400">Choose an example or write your own (optional)</label><select id="objective-example" className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" value="" onChange={e => { if (e.target.value) update({ ...profile, objective: e.target.value }); }}><option value="">Select an example</option>{['Develop a new product', 'Improve an existing product', 'Build software', 'Manage an engineering project', 'Coordinate a team', 'Conduct research', 'Launch a startup', 'Manage multiple interconnected projects', 'Organise an independent project'].map(item => <option key={item} value={item}>{item}</option>)}</select><label htmlFor="workspace-objective" className="block text-sm text-zinc-600 dark:text-zinc-400">Your objective</label><textarea id="workspace-objective" value={profile.objective} maxLength={300} rows={3} onChange={e => update({ ...profile, objective: e.target.value })} placeholder="For example, coordinate a software project or investigate a research question" className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" /></fieldset></Card>
      <Card><fieldset disabled={!canEdit || review} className="space-y-3 p-5"><legend className="px-1 text-lg font-semibold">3. What capabilities matter?</legend><p className="text-sm text-zinc-500">Optional. Interests marked “not yet available” are recorded for context; selecting them does not create that capability.</p><div className="grid gap-2 sm:grid-cols-2">{WORK_REQUIREMENTS.map(id => <label className="flex items-start gap-2 text-sm" key={id}><input type="checkbox" className="mt-1" checked={profile.requirements.includes(id)} onChange={() => update({ ...profile, requirements: toggle<WorkRequirement>(profile.requirements, id) })} /><span>{REQUIREMENT_LABELS[id]}{FUTURE_REQUIREMENTS.includes(id) ? <span className="text-zinc-500"> — not yet available as a dedicated module</span> : ['collaboration', 'analytics', 'ai'].includes(id) ? <span className="text-zinc-500"> — limited existing support</span> : null}</span></label>)}</div></fieldset></Card>
      <Card><fieldset disabled={!canEdit || review} className="space-y-3 p-5"><legend className="px-1 text-lg font-semibold">4. Prioritise navigation</legend><p className="text-sm text-zinc-500">Selected existing tools appear near the top. All other tools remain available. Your personal dashboard layout is not changed.</p>{canEdit && <Button type="button" variant="secondary" onClick={() => update({ ...profile, navigation: suggestWorkspaceNavigation(profile.domains, profile.requirements) })}>Suggest tools from my choices</Button>}<div className="grid gap-2 sm:grid-cols-2">{NAV_FOCUS.map(id => <label className="flex items-center gap-2 text-sm" key={id}><input type="checkbox" checked={profile.navigation.includes(id)} onChange={() => update({ ...profile, navigation: toggle<NavFocus>(profile.navigation, id) })} />{NAV_FOCUS_LABELS[id]}</label>)}</div></fieldset></Card>
      {review && <Card><div className="space-y-2 p-5" aria-live="polite"><h2 className="text-lg font-semibold">Review workspace setup</h2><p className="text-sm"><strong>Work:</strong> {profile.domains.map(id => DOMAIN_LABELS[id]).join(', ')}</p><p className="text-sm"><strong>Objective:</strong> {profile.objective || 'Not specified'}</p><p className="text-sm"><strong>Interests:</strong> {profile.requirements.map(id => REQUIREMENT_LABELS[id]).join(', ') || 'None selected'}</p><p className="text-sm"><strong>Navigation priorities:</strong> {profile.navigation.map(id => NAV_FOCUS_LABELS[id]).join(', ') || 'None selected'}</p><p className="text-sm text-zinc-500">Only navigation order changes. Unavailable capabilities remain unavailable; workspace data and personal dashboard layouts remain unchanged.</p></div></Card>}
      {save.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{save.error instanceof Error ? save.error.message : 'Could not save setup.'} If setup changed in another session, reload this page before trying again.</p>}
      {saved && <p role="status" className="text-sm text-green-700 dark:text-green-400">Workspace setup saved.</p>}
      <div className="flex flex-wrap gap-2">{canEdit && <><Button type="submit" disabled={!profile.domains.length} loading={save.isPending}>{review ? 'Confirm and save' : 'Review setup'}</Button>{review && <Button type="button" variant="secondary" onClick={() => setReview(false)}>Edit choices</Button>}</>}<Link to="/" className="inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold text-blue-700 dark:text-blue-400">Return to dashboard</Link></div>
    </form>
  </div>;
}

export function WorkspaceSetupPage() {
  const me = useSession();
  const profile = useWorkspaceProfile();
  if (me.demo) return <div className="p-6">Workspace setup is unavailable in the temporary demo.</div>;
  if (profile.isLoading) return <Spinner label="Loading workspace setup" />;
  if (profile.isError || !profile.data) return <div className="p-6" role="alert">Could not load workspace setup. <Button variant="secondary" onClick={() => void profile.refetch()}>Retry</Button></div>;
  return <SetupForm key={me.workspace.id} workspaceId={me.workspace.id} initial={profile.data} canEdit={me.workspace.role !== 'member'} />;
}
