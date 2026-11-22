import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Flag,
  ListChecks,
  Plus,
  Stamp,
  X
} from 'lucide-react';
import type { Project, ProjectJourneyView } from '@sv/shared';
import { get } from '../api/client';
import { useSession } from '../api/hooks';
import { useCreateStage, useProjectJourney } from '../api/projectJourney';
import { NewProjectModal } from '../components/journey/NewProjectModal';
import { ProjectSelector } from '../components/journey/ProjectSelector';
import { StageDetail } from '../components/journey/StageDetail';
import { Button, Card, EmptyState, Spinner, cx } from '../components/ui';
import { useToast } from '../components/Toast';
import { useSelectedProjectId, setSelectedProjectId } from '../lib/projectContext';

/**
 * Journey — the default landing page and primary workspace.
 *
 * One connected development path per project: completed, active, blocked and
 * upcoming stages with their activities, tasks, approvals and deliverables.
 * Everything else in the product is reached from here or from the two other
 * primary destinations (AI Assistant, Design Studio).
 */
export function JourneyPage() {
  const me = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const contextProjectId = useSelectedProjectId(me.workspace.id);
  const [creating, setCreating] = useState(false);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });

  const projectList = projects.data ?? [];
  const paramProject = params.get('project');
  const selectedId = useMemo(() => {
    if (paramProject && projectList.some((p) => p.id === paramProject)) return paramProject;
    if (contextProjectId && projectList.some((p) => p.id === contextProjectId)) return contextProjectId;
    return projectList[0]?.id ?? null;
  }, [paramProject, contextProjectId, projectList]);

  // Selecting in the header updates BOTH the shared context and the URL —
  // otherwise the ?project= param keeps pointing at the previous project and
  // the resolution below would immediately revert the choice.
  const selectProject = useCallback(
    (id: string) => {
      setSelectedProjectId(me.workspace.id, id);
      setParams(
        (next) => {
          next.set('project', id);
          return next;
        },
        { replace: true }
      );
    },
    [me.workspace.id, setParams]
  );

  // Keep the shared context and the URL in step with the resolved selection.
  useEffect(() => {
    if (selectedId && selectedId !== contextProjectId) setSelectedProjectId(me.workspace.id, selectedId);
    if (selectedId && paramProject !== selectedId) {
      setParams((next) => {
        next.set('project', selectedId);
        return next;
      }, { replace: true });
    }
    if (!selectedId && paramProject) {
      setParams((next) => {
        next.delete('project');
        return next;
      }, { replace: true });
    }
  }, [selectedId, contextProjectId, paramProject, me.workspace.id, setParams]);

  if (projects.isLoading) return <Spinner label="Loading your journeys" />;

  if (projects.isError) {
    return (
      <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert">
        <p>We couldn’t load your projects.</p>
        <Button className="mt-3" variant="secondary" onClick={() => void projects.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (projectList.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Start your first Journey"
          body="Every project gets its own development Journey — stages, milestones, tasks, approvals and deliverables on one connected path. Create a project and the path opens at stage 1."
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Create a project
            </Button>
          }
        />
        <p className="mt-4 text-center text-sm text-zinc-500">
          You’ll choose a project type, we’ll recommend a lifecycle, and you can customise it any time.
        </p>
        {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      </div>
    );
  }

  const project = projectList.find((p) => p.id === selectedId) ?? projectList[0];

  return (
    <>
      <JourneyHeader
        project={project}
        projectCount={projectList.length}
        onSelect={selectProject}
        onCreate={() => setCreating(true)}
      />
      <JourneyBody key={project.id} projectId={project.id} projectKey={project.key} projectName={project.name} />
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </>
  );
}

function JourneyHeader({
  project,
  projectCount,
  onSelect,
  onCreate
}: {
  project: Project;
  projectCount: number;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const me = useSession();
  const canCreate = me.workspace.role === 'owner' || me.workspace.role === 'admin';
  return (
    <header className="border-b border-slate-200 bg-white px-5 pb-4 pt-5 dark:border-zinc-800 dark:bg-zinc-900 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">{me.workspace.name} / Journey</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
            <span className="mr-2 rounded bg-blue-50 px-1.5 py-0.5 align-middle text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{project.key}</span>
            {project.name}
          </h1>
          {project.description && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-zinc-400">{project.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectSelector selectedId={project.id} onSelect={onSelect} onCreate={onCreate} />
          {canCreate && projectCount > 0 && (
            <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
              New project
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function JourneyBody({ projectId, projectKey, projectName }: { projectId: string; projectKey: string; projectName: string }) {
  const journey = useProjectJourney(projectId);
  const createStage = useCreateStage(projectId);
  const toast = useToast();
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);
  const [stageName, setStageName] = useState('');
  const [stageDescription, setStageDescription] = useState('');

  // Open the current stage the first time the journey loads; later the user decides.
  useEffect(() => {
    if (!journey.data || expandedStageId !== null) return;
    const active = journey.data.stages.find((stage) => stage.state === 'active') ?? journey.data.stages[0];
    if (active) setExpandedStageId(active.id);
  }, [journey.data, expandedStageId]);

  if (journey.isLoading) return <div className="p-6"><Spinner label="Loading journey" /></div>;
  if (journey.isError || !journey.data) {
    return (
      <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert">
        <p className="font-semibold">We could not load this Journey.</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{(journey.error as Error | undefined)?.message ?? 'Please try again.'}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void journey.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const view: ProjectJourneyView = journey.data;
  const { summary, stages } = view;
  const nextAction = summary.nextAction;
  const nextMilestone = summary.upcomingMilestones[0];

  const addStage = () => {
    const name = stageName.trim();
    if (!name) return;
    createStage.mutate(
      { name, description: stageDescription.trim() },
      {
        onSuccess: () => {
          setStageName('');
          setStageDescription('');
          setAddingStage(false);
          toast.success('Stage added to the journey');
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not add stage')
      }
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 md:px-8">
      {/* Summary — what needs attention right now */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            <ListChecks className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" /> Journey progress
          </dt>
          <dd className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">{summary.percent}%</span>
            <span className="text-xs text-zinc-500">
              {summary.stagesCompleted}/{summary.stagesTotal} stages
            </span>
          </dd>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Journey progress">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${summary.percent}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Next action
          </dt>
          <dd className="mt-1.5">
            {nextAction ? (
              <>
                <p className="text-sm font-semibold leading-5 text-blue-950 dark:text-blue-100">{nextAction.title}</p>
                <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">{nextAction.stageName}</p>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline dark:text-blue-300"
                  onClick={() => setExpandedStageId(nextAction.stageId)}
                >
                  Open stage <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : summary.stagesCompleted === summary.stagesTotal && summary.stagesTotal > 0 ? (
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">All stages complete — revisit any stage as needed.</p>
            ) : (
              <p className="text-sm text-blue-900 dark:text-blue-200">Everything left is blocked or waiting. Clear a blocker above.</p>
            )}
          </dd>
        </div>

        <div className={cx('rounded-xl border p-4 dark:bg-zinc-900', summary.blockers > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-800' : 'border-zinc-200 bg-white dark:border-zinc-800')}>
          <dt className={cx('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide', summary.blockers > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500')}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Blockers
          </dt>
          <dd className={cx('mt-1.5 text-2xl font-bold tabular-nums', summary.blockers > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-zinc-50')}>{summary.blockers}</dd>
          <p className="mt-1 text-xs text-zinc-500">{summary.blockers > 0 ? 'Activities marked blocked' : 'Nothing blocked'}</p>
        </div>

        <div className={cx('rounded-xl border p-4 dark:bg-zinc-900', summary.pendingApprovals > 0 ? 'border-violet-300 bg-violet-50 dark:border-violet-800' : 'border-zinc-200 bg-white dark:border-zinc-800')}>
          <dt className={cx('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide', summary.pendingApprovals > 0 ? 'text-violet-700 dark:text-violet-400' : 'text-zinc-500')}>
            <Stamp className="h-3.5 w-3.5" aria-hidden="true" /> Pending approvals
          </dt>
          <dd className={cx('mt-1.5 text-2xl font-bold tabular-nums', summary.pendingApprovals > 0 ? 'text-violet-700 dark:text-violet-400' : 'text-slate-900 dark:text-zinc-50')}>
            {summary.pendingApprovals}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {nextMilestone ? (
              <>
                Next milestone: <span className="font-medium text-zinc-700 dark:text-zinc-300">{nextMilestone.title}</span>
                {nextMilestone.dueAt ? ` · ${new Date(nextMilestone.dueAt).toLocaleDateString()}` : ''}
              </>
            ) : (
              'No approvals waiting'
            )}
          </p>
        </div>
      </dl>

      {/* The path */}
      <section aria-label="Development path" className="space-y-0">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Development path</h2>
          <span className="text-xs text-zinc-500">{summary.activitiesCompleted}/{summary.activitiesTotal} activities complete</span>
        </div>

        <ol className="relative">
          {stages.map((stage, index) => {
            const expanded = expandedStageId === stage.id;
            const isLast = index === stages.length - 1;
            const completed = stage.state === 'completed';
            const active = stage.state === 'active';
            const blocked = stage.state === 'blocked';
            return (
              <li key={stage.id} className="relative">
                {/* Connector to the next stage */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute left-[27px] top-14 h-[calc(100%-3.5rem)] w-1 rounded-full sm:left-[35px]',
                      completed ? 'bg-emerald-400 dark:bg-emerald-700' : 'bg-zinc-200 dark:bg-zinc-800'
                    )}
                  />
                )}
                <div className={cx('relative flex gap-3 sm:gap-4', index > 0 && 'pt-3')}>
                  {/* Stage node */}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${stage.state === 'completed' ? 'Completed stage' : stage.state === 'upcoming' ? 'Upcoming stage' : 'Current stage'}: ${stage.name}`}
                    onClick={() => setExpandedStageId(expanded ? null : stage.id)}
                    className={cx(
                      'relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 text-sm font-bold transition-transform sm:h-[70px] sm:w-[70px]',
                      completed && 'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600',
                      active && 'border-blue-500 bg-blue-500 text-white shadow-[0_0_0_4px_rgba(59,130,246,0.18)] dark:border-blue-400 dark:bg-blue-500',
                      blocked && 'border-amber-500 bg-amber-500 text-white shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
                      !completed && !active && !blocked && 'border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500'
                    )}
                  >
                    {completed ? <Check className="h-6 w-6" aria-hidden="true" /> : blocked ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : index + 1}
                  </button>

                  {/* Stage card */}
                  <div className={cx('min-w-0 flex-1 rounded-xl border bg-white dark:bg-zinc-900', expanded ? 'border-blue-300 dark:border-blue-800' : 'border-zinc-200 dark:border-zinc-800')}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                      onClick={() => setExpandedStageId(expanded ? null : stage.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cx('text-sm font-semibold', completed ? 'text-zinc-500 dark:text-zinc-400' : 'text-slate-900 dark:text-zinc-50')}>{stage.name}</span>
                          <span
                            className={cx(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              completed && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                              active && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                              blocked && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                              stage.state === 'upcoming' && 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                            )}
                          >
                            {stage.state}
                          </span>
                          {stage.blockers > 0 && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{stage.blockers} blocked</span>}
                        </span>
                        {stage.description && <span className="mt-0.5 block truncate text-xs text-zinc-500">{stage.description}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 sm:block dark:bg-zinc-800">
                          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${stage.percent}%` }} />
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-zinc-500">
                          {stage.completedUnits}/{stage.totalUnits}
                        </span>
                        <ChevronRight className={cx('h-4 w-4 text-zinc-400 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
                      </span>
                    </button>
                    {expanded && <StageDetail projectId={projectId} projectKey={projectKey} stage={stage} allActivities={stages.flatMap((s) => s.activities)} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Customisable stages */}
        {addingStage ? (
          <Card className="mt-4 space-y-3 p-4">
            <h3 className="text-sm font-semibold">Add a stage</h3>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={stageName}
              maxLength={120}
              onChange={(event) => setStageName(event.target.value)}
              placeholder="Stage name, e.g. Supplier selection"
              aria-label="Stage name"
            />
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={stageDescription}
              maxLength={2000}
              onChange={(event) => setStageDescription(event.target.value)}
              placeholder="What happens in this stage? (optional)"
              aria-label="Stage description"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={addStage} loading={createStage.isPending} disabled={!stageName.trim()}>
                Add stage
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingStage(false)}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-700 dark:hover:text-blue-300"
            onClick={() => setAddingStage(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add stage — customise this lifecycle
          </button>
        )}
      </section>

      {/* Contextual links — the rest of the product, reached from Journey */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Also in this project</span>
        <Link to={`/projects/${projectId}/issues`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
          Task board & issues
        </Link>
        <Link to={`/projects/${projectId}`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
          Diagrams
        </Link>
        <Link to={`/assistant?project=${projectId}`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
          Ask the AI Assistant
        </Link>
        <Link to={`/designs?project=${projectId}`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
          Design Studio
        </Link>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500">
          <Flag className="h-3.5 w-3.5" aria-hidden="true" /> {projectName}’s Journey is the source of truth for this project
        </span>
      </footer>
    </div>
  );
}
