import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { get } from '../../api/client';
import { useSession } from '../../api/hooks';
import { Card, CardHeader, ProgressBar, Spinner } from '../ui';
import { useDashboardDensity } from './density';

interface IssueRow {
  id: string;
  projectId: string;
  key: string;
  summary: string;
  status: string;
  priority: string;
  updatedAt: string;
}
interface Summary {
  projectCount: number;
  total: number;
  done: number;
  open: number;
  projects: { id: string; key: string; name: string; total: number; done: number }[];
  assigned: IssueRow[];
  priority: IssueRow[];
  recent: IssueRow[];
  dependencies: IssueRow[];
  workload: { id: string; name: string; open: number }[];
}
function useSummary() {
  const { user, workspace } = useSession();
  return useQuery({ queryKey: ['dashboard-summary', user.id, workspace.id], queryFn: () => get<Summary>('/dashboard/summary'), staleTime: 0 });
}
function DataCard({ title, children }: { title: string; children: (data: Summary, limit: number) => React.ReactNode }) {
  const query = useSummary();
  const density = useDashboardDensity();
  return (
    <Card className="h-full">
      <CardHeader title={title} />
      {query.isLoading ? (
        <Spinner label={`Loading ${title}`} />
      ) : query.isError ? (
        <div className="p-4 text-sm text-rose-700" role="alert">
          Could not load this widget.{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : query.data ? (
        children(query.data, density === 'compact' ? 3 : 6)
      ) : null}
    </Card>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-zinc-500">{children}</p>;
}
function Issues({ rows, empty, limit }: { rows: IssueRow[]; empty: string; limit: number }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.slice(0, limit).map((issue) => (
        <li key={issue.id}>
          <Link
            className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            to={`/projects/${issue.projectId}/issues?issueId=${issue.id}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                {issue.key} · {issue.status}
              </span>
              <span>{issue.priority}</span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">{issue.summary}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
export function ProjectSummary() {
  return (
    <DataCard title="Project overview">
      {(d) => (
        <Link to="/projects" className="block p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
          <p className="text-2xl font-semibold">{d.projectCount}</p>
          <p className="mt-1 text-sm text-zinc-500">Projects in this workspace</p>
        </Link>
      )}
    </DataCard>
  );
}
export function IssueProgress() {
  return (
    <DataCard title="Issue completion">
      {(d) => (
        <Link to="/projects" className="block space-y-2 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
          <p className="text-2xl font-semibold">{d.total ? Math.round((d.done / d.total) * 100) + '%' : '—'}</p>
          <ProgressBar value={d.total ? (d.done / d.total) * 100 : 0} />
          <p className="text-sm text-zinc-500">
            {d.done} of {d.total} issues done · {d.open} open
          </p>
        </Link>
      )}
    </DataCard>
  );
}
export function AssignedIssues() {
  return (
    <DataCard title="My assigned issues">
      {(d, n) => <Issues rows={d.assigned} limit={n} empty="No open issues assigned to you." />}
    </DataCard>
  );
}
export function PriorityIssues() {
  return (
    <DataCard title="High-priority issues">
      {(d, n) => <Issues rows={d.priority} limit={n} empty="No open high or critical priority issues." />}
    </DataCard>
  );
}
export function RecentIssues() {
  return (
    <DataCard title="Recently updated issues">{(d, n) => <Issues rows={d.recent} limit={n} empty="No project issues yet." />}</DataCard>
  );
}
export function Dependencies() {
  return (
    <DataCard title="Open dependencies">
      {(d, n) => (
        <>
          <p className="px-4 pt-3 text-xs text-zinc-500">Open issues depending on another unfinished issue.</p>
          <Issues rows={d.dependencies} limit={n} empty="No open dependencies recorded." />
        </>
      )}
    </DataCard>
  );
}
export function ProjectList() {
  return (
    <DataCard title="Projects">
      {(d, n) =>
        d.projects.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {d.projects.slice(0, n).map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}/issues`} className="block px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <div className="flex justify-between gap-2">
                    <span>
                      <span className="mr-2 text-xs text-zinc-500">{p.key}</span>
                      {p.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {p.done}/{p.total} done
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={p.total ? (p.done / p.total) * 100 : 0} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No projects in this workspace yet.</Empty>
        )
      }
    </DataCard>
  );
}
export function TeamWorkload() {
  return (
    <DataCard title="Team workload">
      {(d, n) =>
        d.workload.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {d.workload.slice(0, n).map((m) => (
              <li key={m.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span>{m.name}</span>
                <span className="text-zinc-500">{m.open} open issues</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No workspace members found.</Empty>
        )
      }
    </DataCard>
  );
}
