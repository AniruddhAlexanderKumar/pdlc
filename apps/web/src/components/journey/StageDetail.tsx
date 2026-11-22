import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  Link2,
  Package,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Scale,
  ShieldAlert,
  Stamp,
  Trash2,
  X
} from 'lucide-react';
import {
  JOURNEY_ACTIVITY_KIND_LABELS,
  ISSUE_PRIORITIES,
  type JourneyActivityKind,
  type JourneyActivity,
  type JourneyStageView,
  type Project
} from '@sv/shared';
import { get, patch, post } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useActivityDependency,
  useActivityReview,
  useCreateActivity,
  useDeleteActivity,
  useJourneyMembers,
  useLinkArtifact,
  useRemoveDependency,
  useUpdateActivity
} from '../../api/projectJourney';
import { Button, Input, Select, cx } from '../ui';
import { useToast } from '../Toast';

const KIND_ICONS: Record<JourneyActivityKind, typeof Flag> = {
  requirement: ClipboardList,
  milestone: Flag,
  deliverable: Package,
  document: FileText,
  approval: Stamp,
  decision: Scale,
  risk: ShieldAlert
};

const STATUS_STYLES: Record<string, string> = {
  not_started: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_review: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  blocked: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  completed: 'Completed'
};

function statusChip(status: string) {
  return (
    <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[status] ?? STATUS_STYLES.not_started)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * The detail panel for one stage: its activities (with status, assignment,
 * deadlines, dependencies and approvals), its tasks, and its linked Design
 * Studio artefacts. This is where all project work is managed — no other
 * module needs to be opened for a single workflow.
 */
export function StageDetail({
  projectId,
  projectKey,
  stage,
  allActivities
}: {
  projectId: string;
  projectKey: string;
  stage: JourneyStageView;
  allActivities: JourneyActivity[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const members = useJourneyMembers(projectId);
  const [newKind, setNewKind] = useState<JourneyActivityKind>('requirement');
  const [newTitle, setNewTitle] = useState('');
  const [newTask, setNewTask] = useState('');
  const [depDraft, setDepDraft] = useState<Record<string, string>>({});

  const createActivity = useCreateActivity(projectId);
  const updateActivity = useUpdateActivity(projectId);
  const deleteActivity = useDeleteActivity(projectId);
  const review = useActivityReview(projectId);
  const addDep = useActivityDependency(projectId);
  const removeDep = useRemoveDependency(projectId);
  const linkArtifact = useLinkArtifact(projectId);

  // Project artefacts available to attach to an activity in this stage.
  const linkedArtifactIds = useMemo(
    () => new Set(allActivities.flatMap((a) => a.artifacts.map((artifact) => artifact.id))),
    [allActivities]
  );
  const diagrams = useQuery({
    queryKey: ['designs', projectId, 'journey-link'],
    queryFn: () => get<{ id: string; title: string }[]>(`/designs?projectId=${encodeURIComponent(projectId)}`),
  });
  const sketches = useQuery({
    queryKey: ['cad-documents', 'journey-link', projectId],
    queryFn: () => get<{ id: string; name: string; projectId?: string | null }[]>('/cad-documents'),
    retry: false
  });
  const artifacts = [
    ...(diagrams.data ?? []).map((d) => ({ id: d.id, title: d.title, type: 'diagram' as const })),
    ...(sketches.data ?? [])
      .filter((s) => s.projectId === projectId)
      .map((s) => ({ id: s.id, title: s.name, type: 'sketch' as const }))
  ].filter((artifact) => !linkedArtifactIds.has(artifact.id));

  const fail = (error: unknown, fallback: string) => toast.error(error instanceof Error ? error.message : fallback);

  const addActivity = (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createActivity.mutate(
      { stageId: stage.id, kind: newKind, title },
      {
        onSuccess: () => {
          setNewTitle('');
          toast.success('Activity added to the journey');
        },
        onError: (error) => fail(error, 'Could not add activity')
      }
    );
  };

  const createTask = (event: FormEvent) => {
    event.preventDefault();
    const summary = newTask.trim();
    if (!summary) return;
    post(`/projects/${projectId}/issues`, { summary, stageId: stage.id, type: 'Task' })
      .then(() => {
        setNewTask('');
        void qc.invalidateQueries({ queryKey: ['project-issues'] });
        void qc.invalidateQueries({ queryKey: ['projects'] });
        void qc.invalidateQueries({ queryKey: ['project-journey', projectId] });
        toast.success('Task added to this stage');
      })
      .catch((error: unknown) => fail(error, 'Could not create task'));
  };

  const cycleIssueStatus = (issueId: string, current: string) => {
    const next = current === 'Open' ? 'In Progress' : current === 'In Progress' ? 'Done' : 'Open';
    patch(`/projects/${projectId}/issues/${issueId}`, { status: next })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['project-journey', projectId] });
        void qc.invalidateQueries({ queryKey: ['projects'] });
      })
      .catch((error: unknown) => fail(error, 'Could not update task'));
  };

  const mutateActivity = (activityId: string, body: Record<string, unknown>, success?: string) => {
    updateActivity.mutate(
      { activityId, ...body },
      {
        onSuccess: () => success && toast.success(success),
        onError: (error) => fail(error, 'Could not update activity')
      }
    );
  };

  const setDue = (activity: JourneyActivity, value: string) => {
    mutateActivity(activity.id, { dueAt: value ? new Date(`${value}T12:00:00`).toISOString() : null });
  };

  return (
    <div className="space-y-4 border-t border-zinc-100 px-4 pb-5 pt-4 dark:border-zinc-800" onClick={(event) => event.stopPropagation()}>
      {stage.description && <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{stage.description}</p>}

      {/* Activities */}
      <section aria-label={`Activities in ${stage.name}`}>
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Activities</h4>
        {stage.activities.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">No activities yet — add the first piece of work below.</p>
        )}
        <ul className="mt-2 space-y-3">
          {stage.activities.map((activity) => {
            const Icon = KIND_ICONS[activity.kind] ?? ClipboardList;
            const ready = activity.waitingOn.length === 0;
            return (
              <li key={activity.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <Icon className={cx('h-4 w-4 shrink-0', activity.kind === 'risk' ? 'text-amber-600' : 'text-blue-600 dark:text-blue-400')} aria-hidden="true" />
                      <span className={cx(activity.status === 'completed' && 'text-zinc-500 line-through')}>{activity.title}</span>
                      {statusChip(activity.status)}
                      {activity.reviewState === 'pending' && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">Review pending</span>
                      )}
                      {activity.reviewState === 'approved' && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Approved</span>
                      )}
                      {activity.reviewState === 'changes_requested' && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">Changes requested</span>
                      )}
                      {!ready && activity.status !== 'completed' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Waiting on {activity.waitingOn.length} {activity.waitingOn.length === 1 ? 'activity' : 'activities'}
                        </span>
                      )}
                    </p>
                    {activity.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{activity.description}</p>}
                    {activity.status === 'blocked' && activity.blockedReason && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Blocked: {activity.blockedReason}</p>
                    )}
                    {activity.reviewNote && activity.reviewState !== 'none' && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Review note{activity.reviewedByName ? ` (${activity.reviewedByName})` : ''}: {activity.reviewNote}
                      </p>
                    )}
                    {activity.waitingOn.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-500">Depends on: {activity.waitingOn.map((w) => w.title).join(', ')}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {JOURNEY_ACTIVITY_KIND_LABELS[activity.kind]}
                  </span>
                </div>

                {/* Controls */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {activity.status === 'not_started' && (
                    <Button size="sm" variant="secondary" icon={<Play className="h-3.5 w-3.5" />} disabled={!ready || updateActivity.isPending} onClick={() => mutateActivity(activity.id, { status: 'in_progress' }, 'Started')}>
                      Start
                    </Button>
                  )}
                  {activity.status !== 'completed' && (
                    <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} disabled={updateActivity.isPending} onClick={() => mutateActivity(activity.id, { status: 'completed' }, 'Completed')}>
                      Mark complete
                    </Button>
                  )}
                  {activity.status === 'completed' && (
                    <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={updateActivity.isPending} onClick={() => mutateActivity(activity.id, { status: 'not_started' })}>
                      Reopen
                    </Button>
                  )}
                  {activity.status !== 'blocked' && activity.status !== 'completed' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Pause className="h-3.5 w-3.5" />}
                      disabled={updateActivity.isPending}
                      onClick={() => {
                        const reason = window.prompt('What is blocking this activity?', '');
                        if (reason === null) return;
                        mutateActivity(activity.id, { status: 'blocked', blockedReason: reason.trim() || 'Blocked' }, 'Marked blocked');
                      }}
                    >
                      Block
                    </Button>
                  )}
                  {activity.status === 'blocked' && (
                    <Button size="sm" variant="secondary" icon={<Play className="h-3.5 w-3.5" />} disabled={updateActivity.isPending} onClick={() => mutateActivity(activity.id, { status: 'not_started', blockedReason: '' }, 'Unblocked')}>
                      Unblock
                    </Button>
                  )}
                  {activity.reviewState !== 'pending' && activity.reviewState !== 'approved' && activity.status !== 'completed' && (
                    <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ activityId: activity.id, action: 'request' }, { onSuccess: () => toast.success('Review requested'), onError: (error) => fail(error, 'Could not request review') })}>
                      Request review
                    </Button>
                  )}
                  {activity.reviewState === 'pending' && (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ activityId: activity.id, action: 'approve' }, { onSuccess: () => toast.success('Approved'), onError: (error) => fail(error, 'Could not approve') })}>
                        <Check className="mr-1 inline h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={review.isPending}
                        onClick={() => {
                          const note = window.prompt('What needs to change?', '');
                          if (note === null) return;
                          review.mutate(
                            { activityId: activity.id, action: 'changes', note: note.trim() },
                            { onSuccess: () => toast.success('Changes requested'), onError: (error) => fail(error, 'Could not record review') }
                          );
                        }}
                      >
                        Request changes
                      </Button>
                    </>
                  )}

                  <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
                    Assignee
                    <Select
                      aria-label={`Assign ${activity.title}`}
                      className="h-8 max-w-[9rem] text-xs"
                      value={activity.assigneeId ?? ''}
                      disabled={updateActivity.isPending}
                      onChange={(event) => mutateActivity(activity.id, { assigneeId: event.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {members.data?.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                    Due
                    <Input
                      type="date"
                      aria-label={`Due date for ${activity.title}`}
                      className="h-8 w-[8.5rem] text-xs"
                      value={activity.dueAt ? activity.dueAt.slice(0, 10) : ''}
                      disabled={updateActivity.isPending}
                      onChange={(event) => setDue(activity, event.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                    Priority
                    <Select
                      aria-label={`Priority for ${activity.title}`}
                      className="h-8 max-w-[6.5rem] text-xs"
                      value={activity.priority}
                      disabled={updateActivity.isPending}
                      onChange={(event) => mutateActivity(activity.id, { priority: event.target.value })}
                    >
                      {ISSUE_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-50"
                    disabled={deleteActivity.isPending}
                    onClick={() => {
                      if (!window.confirm(`Delete “${activity.title}” and its links?`)) return;
                      deleteActivity.mutate(activity.id, { onError: (error) => fail(error, 'Could not delete activity') });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>

                {/* Dependencies */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Depends on
                    <Select
                      aria-label={`Add dependency to ${activity.title}`}
                      className="h-8 max-w-[14rem] text-xs"
                      value={depDraft[activity.id] ?? ''}
                      onChange={(event) => setDepDraft((draft) => ({ ...draft, [activity.id]: event.target.value }))}
                    >
                      <option value="">Choose activity…</option>
                      {allActivities
                        .filter((other) => other.id !== activity.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.title}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!depDraft[activity.id] || addDep.isPending}
                    onClick={() =>
                      addDep.mutate(
                        { activityId: activity.id, dependsOnId: depDraft[activity.id] },
                        {
                          onSuccess: () => {
                            setDepDraft((draft) => ({ ...draft, [activity.id]: '' }));
                            toast.success('Dependency added');
                          },
                          onError: (error) => fail(error, 'Could not add dependency')
                        }
                      )
                    }
                  >
                    Add dependency
                  </Button>
                  {allActivities
                    .filter((other) => other.id !== activity.id)
                    .map((other) => {
                      const depends = allActivities.find((a) => a.id === activity.id)?.waitingOn.some((w) => w.id === other.id);
                      return depends ? (
                        <button
                          key={other.id}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Remove dependency"
                          onClick={() =>
                            removeDep.mutate(
                              { activityId: activity.id, dependsOnId: other.id },
                              { onError: (error) => fail(error, 'Could not remove dependency') }
                            )
                          }
                        >
                          {other.title} <X className="h-3 w-3" />
                        </button>
                      ) : null;
                    })}
                </div>

                {/* Linked Design Studio artefacts */}
                {(activity.artifacts.length > 0 || artifacts.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {activity.artifacts.map((artifact) => (
                      <span key={artifact.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
                        <Link2 className="h-3 w-3 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        <button type="button" className="font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => navigate(artifact.url)}>
                          {artifact.title}
                        </button>
                        <button
                          type="button"
                          aria-label={`Send ${artifact.title} to AI Assistant`}
                          title="Analyse in AI Assistant"
                          className="text-zinc-400 hover:text-blue-600"
                          onClick={() =>
                            navigate(
                              `/assistant?prompt=${encodeURIComponent(
                                `Analyse the design "${artifact.title}" (${artifact.type}) in the context of the ${stage.name} stage of project ${projectKey}. What should I check or improve?`
                              )}`
                            )
                          }
                        >
                          <Send className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Unlink ${artifact.title}`}
                          className="text-zinc-400 hover:text-rose-600"
                          onClick={() => {
                            post(`/journeys/activities/${activity.id}/unlink`, { artifactType: artifact.type, artifactId: artifact.id })
                              .then(() => void qc.invalidateQueries({ queryKey: ['project-journey', projectId] }))
                              .catch((error: unknown) => fail(error, 'Could not unlink design'));
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {artifacts.length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Attach design
                        <Select
                          aria-label={`Attach a design to ${activity.title}`}
                          className="h-8 max-w-[13rem] text-xs"
                          value=""
                          disabled={linkArtifact.isPending}
                          onChange={(event) => {
                            const artifactId = event.target.value;
                            if (!artifactId) return;
                            const artifact = artifacts.find((item) => item.id === artifactId);
                            if (!artifact) return;
                            linkArtifact.mutate(
                              { activityId: activity.id, artifactType: artifact.type, artifactId },
                              { onSuccess: () => toast.success('Design attached to activity'), onError: (error) => fail(error, 'Could not attach design') }
                            );
                          }}
                        >
                          <option value="">Choose design…</option>
                          {artifacts.map((artifact) => (
                            <option key={artifact.id} value={artifact.id}>
                              {artifact.title}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={addActivity} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            New activity
            <Input
              className="mt-1"
              id={`activity-title-${stage.id}`}
              value={newTitle}
              maxLength={200}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="e.g. Draft thermal test plan"
            />
          </label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Kind
            <Select className="mt-1" id={`activity-kind-${stage.id}`} value={newKind} onChange={(event) => setNewKind(event.target.value as JourneyActivityKind)}>
              {(Object.keys(JOURNEY_ACTIVITY_KIND_LABELS) as JourneyActivityKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {JOURNEY_ACTIVITY_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm" icon={<Plus className="h-4 w-4" />} loading={createActivity.isPending} disabled={!newTitle.trim()}>
            Add activity
          </Button>
        </form>
      </section>

      {/* Tasks (project issues) attached to this stage */}
      <section aria-label={`Tasks in ${stage.name}`} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Tasks</h4>
          <button type="button" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400" onClick={() => navigate(`/projects/${projectId}/issues`)}>
            Open task board
          </button>
        </div>
        {stage.issues.length === 0 && <p className="mt-2 text-sm text-zinc-500">No tasks in this stage yet.</p>}
        <ul className="mt-2 space-y-2">
          {stage.issues.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="min-w-0">
                <button type="button" className="font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => navigate(`/projects/${projectId}/issues?issueId=${issue.id}`)}>
                  {issue.key}
                </button>{' '}
                <span className="text-zinc-700 dark:text-zinc-300">{issue.summary}</span>
                {issue.assigneeName && <span className="ml-2 text-xs text-zinc-500">· {issue.assigneeName}</span>}
              </span>
              <button
                type="button"
                className={cx(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  issue.status === 'Done'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : issue.status === 'In Progress'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                )}
                title="Click to advance status"
                onClick={() => cycleIssueStatus(issue.id, issue.status)}
              >
                {issue.status}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={createTask} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            New task
            <Input className="mt-1" id={`task-title-${stage.id}`} value={newTask} maxLength={200} onChange={(event) => setNewTask(event.target.value)} placeholder="e.g. Order thermocouple sensors" />
          </label>
          <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!newTask.trim()}>
            Add task
          </Button>
        </form>
      </section>

      {/* Quick stats for the stage */}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> {stage.blockers} blocked
        </span>
        <span>
          {stage.completedUnits} of {stage.totalUnits} items done
        </span>
        <span className="inline-flex items-center gap-1">
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> {stage.percent}%
        </span>
      </p>
    </div>
  );
}
