import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  type Issue,
  type IssuePage,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
  type Project
} from '@sv/shared';
import { get, patch, post } from '../api/client';
import { useMembers, useSession } from '../api/hooks';
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 25;

export function ProjectIssuesPage() {
  const { projectId = '' } = useParams();
  const session = useSession();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const issueId = searchParams.get('issueId') ?? '';
  const [useIssueId, setUseIssueId] = useState(Boolean(issueId));
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<IssueType>('Task');
  const [priority, setPriority] = useState<IssuePriority>('Medium');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });
  const project = projectsQuery.data?.find((item) => item.id === projectId);
  const issuesQuery = useQuery({
    queryKey: ['project-issues', projectId, search, offset, useIssueId ? issueId : ''],
    queryFn: () =>
      get<IssuePage>(
        `/projects/${projectId}/issues?limit=${PAGE_SIZE}&offset=${offset}&q=${encodeURIComponent(search.trim())}${useIssueId ? `&issueId=${encodeURIComponent(issueId)}` : ''}`
      ),
    enabled: Boolean(projectId)
  });
  const membersQuery = useMembers();

  const refreshIssues = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    ]);
  };
  const createIssue = useMutation({
    mutationFn: () =>
      post<Issue>(`/projects/${projectId}/issues`, {
        type,
        priority,
        summary,
        description,
        labels: labels.split(',').map((label) => label.trim()).filter(Boolean),
        assigneeId: assigneeId || null
      }),
    onSuccess: async () => {
      await refreshIssues();
      setCreating(false);
      setSummary('');
      setDescription('');
      setLabels('');
      setAssigneeId('');
      setOffset(0);
      toast.success('Issue created');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create issue')
  });
  const updateIssue = useMutation({
    mutationFn: ({ id, ...changes }: { id: string; status?: IssueStatus; assigneeId?: string | null }) =>
      patch<Issue>(`/projects/${projectId}/issues/${id}`, changes),
    onSuccess: async () => refreshIssues(),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update issue')
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createIssue.mutate();
  };
  const issues = useMemo(() => issuesQuery.data?.items ?? [], [issuesQuery.data]);

  if (projectsQuery.isLoading) return <Spinner label="Loading project" />;
  if (projectsQuery.isError) {
    return <p role="alert" className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{projectsQuery.error.message}</p>;
  }
  if (!project) {
    return (
      <div className="p-6">
        <EmptyState icon={<span className="text-lg">?</span>} title="Project not found" body="It may have been removed or may belong to another workspace." action={<Link className="text-sm font-medium text-blue-600" to="/projects">Back to projects</Link>} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={`${project.key} · ${project.name}`}
        subtitle={project.description || 'Project issues'}
        actions={<Button className={searchParams.get('guide') === 'first-project' ? 'ring-2 ring-blue-400 ring-offset-2' : undefined} icon={<Plus className="h-4 w-4" />} onClick={() => setCreating((value) => !value)}>{creating ? 'Cancel' : 'Create issue'}</Button>}
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All projects
        </Link>

        {session.workspace.role !== 'member' && !session.demo && <Link to={`/external-reviews?project=${encodeURIComponent(projectId)}`} className="ml-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">External Review Access</Link>}

        {searchParams.get('guide') === 'first-project' && <p role="status" className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">Your project is ready. Choose <strong>Create issue</strong> to add work, then <Link className="underline" to="/help">return to the walkthrough</Link>.</p>}
        {creating && (
          <Card className="p-5">
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Issue type" htmlFor="issue-type">
                  <Select id="issue-type" value={type} onChange={(event) => setType(event.target.value as IssueType)}>
                    {ISSUE_TYPES.map((value) => <option key={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Priority" htmlFor="issue-priority">
                  <Select id="issue-priority" value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>
                    {ISSUE_PRIORITIES.map((value) => <option key={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Assignee" htmlFor="issue-assignee">
                  <Select id="issue-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {(membersQuery.data ?? []).map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Summary" htmlFor="issue-summary">
                <Input id="issue-summary" required maxLength={200} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe the work" />
              </Field>
              <Field label="Description" htmlFor="issue-description">
                <Textarea id="issue-description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context or acceptance notes" />
              </Field>
              <Field label="Labels (comma-separated)" htmlFor="issue-labels">
                <Input id="issue-labels" maxLength={700} value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="backend, launch" />
              </Field>
              <Button type="submit" loading={createIssue.isPending}>Create issue</Button>
            </form>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">{issuesQuery.data?.total ?? 0} issues {useIssueId && <button className="ml-2 text-blue-600" onClick={() => setUseIssueId(false)}>Show all issues</button>}</p>
          <Input aria-label="Search project issues" type="search" className="sm:max-w-sm" value={search} onChange={(event) => { setSearch(event.target.value); setUseIssueId(false); setOffset(0); }} placeholder="Search issues" />
        </div>

        {issuesQuery.isLoading ? <Spinner label="Loading issues" /> : issuesQuery.isError ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{issuesQuery.error.message}</p>
        ) : issues.length === 0 ? (
          <EmptyState icon={<Plus className="h-6 w-6" />} title="No issues found" body={search ? 'Try another search.' : 'Create an issue to get work moving in this project.'} action={!search ? <Button onClick={() => setCreating(true)}>Create issue</Button> : undefined} />
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} members={membersQuery.data ?? []} onStatusChange={(status) => updateIssue.mutate({ id: issue.id, status })} onAssigneeChange={(assigneeId) => updateIssue.mutate({ id: issue.id, assigneeId })} />
            ))}
          </div>
        )}
        {issuesQuery.data && issuesQuery.data.total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= issuesQuery.data.total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Next</Button>
          </div>
        )}
      </div>
    </>
  );
}

function IssueCard({ issue, members, onStatusChange, onAssigneeChange }: { issue: Issue; members: { userId: string; name: string }[]; onStatusChange: (status: IssueStatus) => void; onAssigneeChange: (assigneeId: string | null) => void }) {
  const assignee = members.find((member) => member.userId === issue.assigneeId)?.name ?? (issue.assigneeId ? 'Workspace member' : 'Unassigned');
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-blue-600 dark:text-blue-400">{issue.key} · {issue.type}</p>
          <h2 className="mt-1 font-semibold">{issue.summary}</h2>
          {issue.description && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-500">{issue.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{issue.priority}</span>
            {issue.labels.map((label) => <span key={label} className="rounded-full bg-blue-500/10 px-2 py-1 text-blue-700 dark:text-blue-300">{label}</span>)}
            <span>Assignee: {assignee}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3"><label className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">Assignee<Select aria-label={`Assignee for ${issue.key}`} value={issue.assigneeId ?? ''} onChange={(event) => onAssigneeChange(event.target.value || null)}><option value="">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select></label><label className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
          Status
          <Select aria-label={`Status for ${issue.key}`} value={issue.status} onChange={(event) => onStatusChange(event.target.value as IssueStatus)}>
            {ISSUE_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </Select>
        </label></div>
      </div>
    </Card>
  );
}
