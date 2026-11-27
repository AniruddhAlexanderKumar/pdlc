import { Link, useNavigate } from 'react-router';
import { Route } from 'lucide-react';
import { useSession } from '../../api/hooks';
import { useProjectParam } from '../../lib/useProjectParam';
import { ProjectSelector } from './ProjectSelector';

export function ProjectContextBar({ note }: { note?: string }) {
  const me = useSession();
  const [selectedId, select] = useProjectParam(me.workspace.id);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <ProjectSelector selectedId={selectedId} onSelect={select} compact />
      {selectedId && (
        <Link
          to={`/?project=${selectedId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          <Route className="h-3.5 w-3.5" aria-hidden="true" /> Open Journey
        </Link>
      )}
      {note && <span className="text-xs text-zinc-500">{note}</span>}
      {!selectedId && <span className="text-xs text-zinc-500">Select a project so designs stay attached to its Journey.</span>}
    </div>
  );
}

export function DesignProjectBar({ projectId, stepId }: { projectId: string | null; stepId?: string | null }) {
  const navigate = useNavigate();
  const params = new URLSearchParams();
  if (projectId) params.set('project', projectId);
  if (projectId && stepId) params.set('step', stepId);
  return <div className="flex flex-wrap items-center gap-3 px-4 pt-4 md:px-6">
    <ProjectSelector compact selectedId={projectId} onSelect={id => navigate(`/designs?project=${id}`)} />
    <Link className="text-sm font-medium text-blue-700 underline dark:text-blue-300" to={projectId ? `/?${params}` : '/'}>Back to Journey</Link>
  </div>;
}
