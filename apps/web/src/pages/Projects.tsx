import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Project } from '@sv/shared';
import { get, post } from '../api/client';
import { useSession } from '../api/hooks';
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';

export function ProjectsPage() {
  const me = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(params.get('create') === '1');
  const [keyEdited, setKeyEdited] = useState(false);
  useEffect(() => { if (params.get('create') === '1') setCreating(true); }, [params]);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => get<Project[]>('/projects')
  });
  const createProject = useMutation({
    mutationFn: () => post<Project>('/projects', { key, name, description }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreating(false);
      setKey('');
      setName('');
      setDescription('');
      setKeyEdited(false);
      toast.success('Project created');
      navigate(`/projects/${project.id}/issues${params.get('guide') === 'first-project' ? '?guide=first-project' : ''}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create project')
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createProject.mutate();
  };
  const canCreate = me.workspace.role === 'owner' || me.workspace.role === 'admin';

  if (projectsQuery.isLoading) return <Spinner label="Loading projects" />;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Coordinate work in projects without changing your product lifecycle workspace."
        actions={
          canCreate ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating((value) => !value)}>
              {creating ? 'Cancel' : 'New project'}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <Link to="/help/first-project" className="text-sm font-medium text-blue-700 hover:underline">How do projects work?</Link>
        {projectsQuery.isError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Could not load projects.'}
          </p>
        )}

        {creating && canCreate && (
          <Card className={`p-5 ${params.get('guide') === 'first-project' ? 'ring-2 ring-blue-500' : ''}`}>
            {params.get('guide') === 'first-project' && <p role="status" className="mb-4 text-sm text-blue-700">Walkthrough: name your project, review the suggested key and create it. <Link to="/help" className="underline">Return to guide</Link></p>}
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Project name" htmlFor="project-name">
                <Input id="project-name" required maxLength={120} value={name} onChange={(event) => {
                  const value=event.target.value;setName(value);
                  if(!keyEdited){let candidate=value.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^[^A-Z]+/,'').slice(0,8);if(candidate.length===1)candidate+='X';if(!candidate)candidate='PR';const used=new Set(projectsQuery.data?.map(p=>p.key)??[]);let base=candidate, n=2;while(used.has(candidate)&&n<100)candidate=`${base.slice(0,8)}${n++}`;setKey(candidate);}
                }} placeholder="Project name" />
              </Field>
              <Field label="Suggested project key (editable)" htmlFor="project-key" hint="Used to identify issues, for example BUILD-1.">
                <Input id="project-key" required minLength={2} maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{1,9}" value={key} onChange={(event) => {setKeyEdited(true);setKey(event.target.value.toUpperCase());}} placeholder="e.g. BUILD" autoCapitalize="characters" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" htmlFor="project-description">
                  <Textarea
                    id="project-description"
                    rows={2}
                    maxLength={2000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What is this project working toward?"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={createProject.isPending}>Create project</Button>
              </div>
            </form>
          </Card>
        )}

        {projectsQuery.data?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projectsQuery.data.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}/issues`} className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                <Card className="h-full p-5 transition-colors hover:border-blue-300 dark:hover:border-blue-500/50">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <FolderKanban className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold tracking-wide text-blue-600 dark:text-blue-400">{project.key}</p>
                      <h2 className="mt-1 truncate font-semibold">{project.name}</h2>
                    </div>
                    <span className="text-xs text-zinc-500">{project.issueCount} issues</span>
                  </div>
                  <p className="mt-4 line-clamp-2 min-h-10 text-sm text-zinc-500">{project.description || 'No description provided.'}</p>
                </Card>
              </Link>
            ))}
          </div>
        ) : !projectsQuery.isError ? (
          <EmptyState
            icon={<FolderKanban className="h-6 w-6" />}
            title="No projects yet"
            body={canCreate ? 'Create a project to organize issues alongside your existing PDLC products.' : 'A workspace admin can create a project for your team.'}
            action={canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New project</Button> : undefined}
          />
        ) : null}
      </div>
    </>
  );
}
