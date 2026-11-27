import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ArrowRight, Check, Compass, Lock, Plus } from 'lucide-react';
import type { Project } from '@sv/shared';
import { get } from '../api/client';
import { useSession } from '../api/hooks';
import { useCreateStage, useProjectJourney } from '../api/projectJourney';
import { NewProjectModal } from '../components/journey/NewProjectModal';
import { ProjectSelector } from '../components/journey/ProjectSelector';
import { StageDetail } from '../components/journey/StageDetail';
import { Button, Card, EmptyState, Input, Spinner, cx } from '../components/ui';
import { StepWork } from '../components/journey/StepWork';
import { stageTitles, stepLabel } from '../components/journey/stepLabels';
import { useSelectedProjectId, setSelectedProjectId } from '../lib/projectContext';

export function JourneyPage() {
  const me = useSession();
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
          next.delete('step');
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
    if (projects.isSuccess && !selectedId && paramProject) {
      setParams((next) => {
        next.delete('project');
        return next;
      }, { replace: true });
    }
  }, [selectedId, contextProjectId, paramProject, me.workspace.id, setParams, projects.isSuccess]);

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
          body="Create a project to plan what to build, save your designs, and work toward your first release."
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Create a project
            </Button>
          }
        />
        {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      </div>
    );
  }

  const project = projectList.find((p) => p.id === selectedId) ?? projectList[0];

  return (
    <>
      <JourneyHeader
        project={project}

        onSelect={selectProject}
        onCreate={() => setCreating(true)}
      />
      <JourneyBody key={project.id} projectId={project.id} projectKey={project.key} />
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </>
  );
}

function JourneyHeader({
  project,
  onSelect,
  onCreate
}: {
  project: Project;
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
          <ProjectSelector selectedId={project.id} onSelect={onSelect} />
          {canCreate && (
            <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
              New project
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function JourneyBody({ projectId, projectKey }: { projectId: string; projectKey: string }) {
  const journey = useProjectJourney(projectId);
  const [params, setParams] = useSearchParams();
  const [history, setHistory] = useState<string | null>(null);

  function open(id: string) {
    setParams({ project: projectId, step: id }, { replace: true });
  }

  if (journey.isLoading) return <div className="p-6"><Spinner label="Loading journey" /></div>;
  if (journey.isError || !journey.data) return <div className="p-6" role="alert">
    <p>{journey.error?.message ?? 'We could not load your Journey.'}</p>
    <Button variant="secondary" onClick={() => void journey.refetch()}>Try again</Button>
  </div>;

  const { stages, summary } = journey.data;
  const active = stages.find(stage => stage.totalUnits > 0 && stage.state !== 'completed');
  const next = active?.activities.find(step => step.status !== 'completed' && step.status !== 'blocked' && !step.waitingOn.length)
    ?? active?.activities.find(step => step.status !== 'completed');
  const openStep = params.get('step') ?? next?.id;
  const stepIds = stages.flatMap(stage => stage.activities);
  return <div className="mx-auto max-w-4xl space-y-7 px-4 py-6 sm:px-8">
    <Card className="space-y-4 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 dark:border-blue-900 dark:from-blue-950 dark:to-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{summary.stagesCompleted} of {summary.stagesTotal} stages complete</p>
          <h2 className="mt-1 text-2xl font-semibold">{next ? stepLabel(next).title : active ? 'Finish the work in this stage' : 'Journey complete'}</h2>
          {next && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{stepLabel(next).description}</p>}
        </div>
        {active && <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => {
          if (next) open(next.id);
          else setHistory(active.id);
          requestAnimationFrame(() => document.getElementById(next?.id ?? active.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        }}>Continue</Button>}
      </div>
      <div className="flex items-center gap-3">
        <progress className="h-3 w-full accent-blue-600" max={100} value={summary.percent} aria-label="Journey progress" />
        <span className="text-sm font-semibold">{summary.percent}%</span>
      </div>
    </Card>
    <section aria-label="Development path" className="space-y-7">
      {stages.map(stage => {
        const upcoming = active && stage.position > active.position;
        const title = stageTitles[stage.name] ?? stage.name;
        return <section key={stage.id} id={stage.id} className="scroll-m-4 space-y-2" aria-label={title}>
          <div className="flex flex-wrap items-center gap-x-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <span className="text-xs text-zinc-500">{stage.state === 'completed' ? 'Complete' : stage.totalUnits === 0 ? 'No steps yet' : upcoming ? 'Upcoming' : 'Current stage'}</span>
          </div>
          {upcoming && <p className="text-sm text-zinc-500">Finish {stageTitles[active.name] ?? active.name} to open this stage.</p>}
          <ol className="space-y-2 border-l-2 border-blue-100 pl-3 dark:border-blue-950 sm:pl-5">
            {stage.activities.map(activity => {
              const step = stepLabel(activity);
              const done = activity.status === 'completed';
              const locked = upcoming && !done;
              const current = activity.id === next?.id;
              const expanded = !locked && activity.id === openStep;
              const blocked = activity.waitingOn.length > 0 || activity.status === 'blocked';
              return <li key={activity.id} id={activity.id} className={cx('scroll-m-4 rounded-xl border bg-white dark:bg-zinc-900', current ? 'border-blue-400 dark:border-blue-700' : 'border-zinc-200 dark:border-zinc-800')}>
                <button type="button" disabled={locked} aria-expanded={expanded} aria-current={current ? 'step' : undefined} className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-70" onClick={() => open(expanded ? '' : activity.id)}>
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', done ? 'bg-emerald-100 text-emerald-800' : current ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>
                    {done ? <Check className="h-4 w-4" /> : locked || blocked ? <Lock className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{step.title}</span>
                    <span className="block text-sm text-zinc-600 dark:text-zinc-300">{step.description}</span>
                    {(done || current || blocked || step.optional) && <span className="block text-xs text-zinc-500">{done ? activity.skipped ? 'Skipped' : 'Done' : blocked ? activity.waitingOn.length ? 'Finish ' + activity.waitingOn.map(item => item.title).join(', ') : activity.blockedReason || 'Blocked' : current ? 'Up next' : 'Optional'}</span>}
                  </span>
                </button>
                {expanded && <StepWork key={activity.id} projectId={projectId} activity={activity} />}
              </li>;
            })}
          </ol>
          {(!upcoming || stage.totalUnits === 0) && <details open={history === stage.id ? true : undefined} className="text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300" onClick={() => {
              if (history === stage.id) setHistory(null);
            }}>Project history and step details</summary>
            <HistoryWork projectId={projectId} projectKey={projectKey} stage={stage} allActivities={stepIds} />
          </details>}
        </section>;
      })}
    </section>
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Customize this path</summary>
      <AddStage projectId={projectId} />
    </details>
  </div>;
}

function AddStage({ projectId }: { projectId: string }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const add = useCreateStage(projectId);
  return <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={event => {
    event.preventDefault();
    add.mutate({ name, description }, { onSuccess: () => { setName(''); setDescription(''); } });
  }}>
    <label>Stage name<Input maxLength={120} required value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Description (optional)<Input maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <Button type="submit" variant="secondary" loading={add.isPending}>Add stage</Button>
    {add.error && <p role="alert">{add.error.message}</p>}
  </form>;
}

function HistoryWork(props: Parameters<typeof StageDetail>[0]) {
  const [opened, setOpened] = useState(false);
  return opened ? <StageDetail {...props} /> : <Button className="ml-3" size="sm" variant="secondary" onClick={() => setOpened(true)}>Show stage records and settings</Button>;
}
